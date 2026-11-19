import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import React from 'react';
import {cleanup,render,screen,within} from '@testing-library/react';
import {PaperQualityFeedback} from '../app/components/research-workflow/paper-quality-feedback.tsx';
import {projectQualityHistory} from '../lib/paper-quality-history.ts';
import {historyFixture,historyCall,historyEvent,reviseHistoryReview} from './support/paper-quality-history-fixture.mjs';
afterEach(cleanup);
test('review progress and concrete findings are accessible without rendering a draft or provider details',()=>{
 const quality={version:'paper-quality-v1',phase:'repairing',round:0,findings:[{id:'zero-delay',severity:'blocking',location:'Network calibration',explanation:'Handle the omitted zero delay.',evidence:'The original helper rejects the verified zero-delay representation.'}]};
 const {rerender}=render(React.createElement(PaperQualityFeedback,{quality,step:4}));assert.match(screen.getByRole('status').textContent,/Repairing/);assert.equal(screen.getByRole('region',{name:'Paper quality checks'}).getAttribute('aria-busy'),'true');assert.ok(screen.getByText('Review findings (1)'));assert.ok(screen.getByText(/Network calibration: Handle/));
 rerender(React.createElement(PaperQualityFeedback,{quality:{...quality,round:2},step:4}));assert.match(screen.getByRole('status').textContent,/repair round 3 of 3/);
 rerender(React.createElement(PaperQualityFeedback,{quality:{...quality,phase:'reviewing',round:3},step:4}));assert.match(screen.getByRole('status').textContent,/after repair round 3 of 3/);
 rerender(React.createElement(PaperQualityFeedback,{quality:{...quality,phase:'needs_attention',round:1},step:4}));assert.match(screen.getByRole('alert').textContent,/attention/);assert.equal(screen.getByText('Review findings (1)').parentElement.open,true);
 rerender(React.createElement(PaperQualityFeedback,{quality:{...quality,phase:'approved',findings:[]},step:4}));assert.equal(screen.queryByRole('alert'),null);assert.equal(screen.queryByRole('status'),null);assert.equal(screen.queryByText('Review findings (1)'),null);
});
test('each step shows saved rounds, actual timestamps and earlier findings while a later review runs',()=>{
 for(const step of [2,3,4]){
  const fixture=historyFixture(),history=projectQualityHistory(fixture.calls,fixture.events),quality={version:'paper-quality-v1',phase:'reviewing',round:1,findings:[],history};
  const {rerender}=render(React.createElement(PaperQualityFeedback,{quality,step}));
  assert.ok(screen.getByRole('heading',{name:'Review and repair history'}));assert.match(screen.getByRole('status').textContent,/Review 2 of 4.*In progress/);
  const entries=screen.getByRole('list',{name:'Review and repair rounds'}).children;assert.equal(entries.length,3);assert.ok(within(entries[0]).getByText('The cleanup path needs repair.'));assert.ok(within(entries[1]).getByText('Saved for review'));
  assert.equal(within(entries[2]).getByText('In progress').textContent,'In progress');assert.equal(entries[2].getAttribute('aria-current'),'step');
  assert.deepEqual([...entries[0].querySelectorAll('time')].map(t=>t.dateTime),[fixture.calls[0].created_at,fixture.calls[0].updated_at]);assert.equal(entries[2].querySelectorAll('time').length,1);
  assert.equal(screen.queryByText(/· Resolved/),null);assert.equal(screen.queryByRole('heading',{name:'Paper breakdown'}),null);
  const approved=historyFixture('completed');rerender(React.createElement(PaperQualityFeedback,{quality:{...quality,phase:'approved',history:projectQualityHistory(approved.calls,approved.events)},step}));
  assert.equal(screen.getByRole('list',{name:'Review and repair rounds'}).children.length,3);assert.ok(screen.getByText('Owned-resource cleanup · Resolved'));assert.ok(screen.getByText('The final action removes owned namespaces on both success and handled failure.'));assert.ok(screen.getByText('Passed'));cleanup();
 }
});
test('queued rounds have no invented timestamps and saved repairs do not claim resolution',()=>{
 const first=projectQualityHistory([historyCall(1)],[historyEvent(1)]),quality={version:'paper-quality-v1',phase:'repairing',round:0,findings:[],history:first};
 const {rerender}=render(React.createElement(PaperQualityFeedback,{quality,step:2}));assert.match(screen.getByRole('status').textContent,/Repair 1 of 3.*Queued/);assert.equal(screen.getByRole('list',{name:'Review and repair rounds'}).children.length,1);assert.equal(document.querySelectorAll('time').length,2);
 const saved=projectQualityHistory([historyCall(1),historyCall(2)],[historyEvent(2),historyEvent(1)]);rerender(React.createElement(PaperQualityFeedback,{quality:{...quality,phase:'reviewing',round:1,history:saved},step:2}));assert.match(screen.getByRole('status').textContent,/Review 2 of 4.*Queued/);assert.equal(screen.queryByText(/· Resolved/),null);assert.ok(screen.getByText('Repair saved. The next review verifies the findings below.'));
 const report={...reviseHistoryReview(),resolutions:[{key:'review-1:cleanup',status:'open',evidence:'The final cleanup is still absent.'}]},reviewed=projectQualityHistory(historyFixture('completed').calls,[historyEvent(3,report),historyEvent(1)]);
 rerender(React.createElement(PaperQualityFeedback,{quality:{...quality,phase:'repairing',round:1,history:reviewed},step:2}));assert.ok(screen.getByText('Owned-resource cleanup · Still open'));
});
test('history outages preserve current progress and findings with an explicit availability message',()=>{
 render(React.createElement(PaperQualityFeedback,{quality:{version:'paper-quality-v1',phase:'reviewing',round:0,findings:[],history_unavailable:true},step:2}));assert.ok(screen.getByText('Review history is temporarily unavailable.'));assert.equal(screen.queryByText('Reviewing the paper breakdown before displaying the completed output.'),null);
});
