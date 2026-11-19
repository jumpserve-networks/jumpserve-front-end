import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {ResearchHeader} from '../app/components/research-workflow/header.tsx';
import {PaperQualityHistoryMenu,PaperQualityHistoryProvider} from '../app/components/research-workflow/paper-quality-history-dialog.tsx';
import {projectQualityHistory} from '../lib/paper-quality-history.ts';
import {historyFixture} from './support/paper-quality-history-fixture.mjs';

afterEach(cleanup);
const quality=(phase='approved')=>{const saved=historyFixture(phase==='approved'?'completed':'processing');return{version:'paper-quality-v1',phase,round:1,findings:[],history:projectQualityHistory(saved.calls,saved.events),agent_history:[{round:1,position:1,label:'Checked retained evidence',status:'completed',started_at:'2026-11-18T12:02:10.000Z',completed_at:'2026-11-18T12:02:15.000Z',detail:'The draft remains bound to the original paper.'}]};};
const header=()=>React.createElement(ResearchHeader,{title:'An assessed research paper',showModuleLabel:false,actions:React.createElement(PaperQualityHistoryMenu)});
const owner=(value)=>React.createElement(PaperQualityHistoryProvider,{quality:value},header());
async function open(){await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Paper actions'}));});await act(async()=>{fireEvent.click(await screen.findByRole('menuitem',{name:'Review and Repair History'}));});return screen.findByRole('dialog',{name:'Review and Repair History'});}

test('completed Step 2 history opens only from the title menu and restores focus on close',async()=>{
 render(owner(quality()));const title=screen.getByRole('heading',{name:'An assessed research paper'}),trigger=screen.getByRole('button',{name:'Paper actions'});
 assert.ok(within(title.parentElement).getByRole('button',{name:'Paper actions'}));assert.equal(screen.queryByRole('list',{name:'Review and repair rounds'}),null);
 const dialog=await open();assert.equal(within(dialog).getByRole('list',{name:'Review and repair rounds'}).children.length,3);assert.ok(within(dialog).getByText('Owned-resource cleanup · Resolved'));assert.ok(within(dialog).getByText(/Checked retained evidence/));assert.ok(within(dialog).getByText('The draft remains bound to the original paper.'));
 await act(async()=>{fireEvent.click(within(dialog).getByRole('button',{name:'Close'}));});await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));await waitFor(()=>assert.equal(document.activeElement,trigger));assert.equal(screen.queryByRole('list',{name:'Review and repair rounds'}),null);
});

test('processing history remains in the modal and updates there as reviews finish',async()=>{
 const view=render(owner(quality('reviewing')));assert.equal(screen.queryByRole('status'),null);assert.equal(screen.queryByRole('list',{name:'Review and repair rounds'}),null);
 const dialog=await open();assert.match(within(dialog).getByRole('status').textContent,/Review 2 of 4.*In progress/);
 view.rerender(owner(quality()));assert.equal(within(dialog).queryByRole('status'),null);assert.ok(within(dialog).getByText('Passed'));
 await act(async()=>{fireEvent.keyDown(dialog,{key:'Escape'});});await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));
});

test('the owner menu is available before the first review, while missing history stays explicit',async()=>{
 const view=render(owner(undefined));let dialog=await open();assert.ok(within(dialog).getByText('No review or repair rounds have been recorded yet.'));
 view.rerender(owner({version:'paper-quality-v1',phase:'repairing',round:0,findings:[],history_unavailable:true}));assert.ok(within(dialog).getByText('Review history is temporarily unavailable.'));assert.match(within(dialog).getByRole('status').textContent,/Repairing/);
});

test('removing owner scope closes the modal and exposes no history action to public readers',async()=>{
 const view=render(owner(quality()));await open();view.rerender(header());assert.equal(screen.queryByRole('dialog'),null);assert.equal(screen.queryByRole('button',{name:'Paper actions'}),null);assert.equal(screen.queryByText('The draft remains bound to the original paper.'),null);
});
