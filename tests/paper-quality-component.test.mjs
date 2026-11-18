import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import React from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import {PaperQualityFeedback} from '../app/components/research-workflow/paper-quality-feedback.tsx';
afterEach(cleanup);
test('review progress and concrete findings are accessible without rendering a draft or provider details',()=>{
 const quality={version:'paper-quality-v1',phase:'repairing',round:0,findings:[{id:'zero-delay',severity:'blocking',location:'Network calibration',explanation:'Handle the omitted zero delay.',evidence:'The original helper rejects the verified zero-delay representation.'}]};
 const {rerender}=render(React.createElement(PaperQualityFeedback,{quality,step:4}));assert.match(screen.getByRole('status').textContent,/Repairing/);assert.equal(screen.getByRole('region',{name:'Paper quality checks'}).getAttribute('aria-busy'),'true');assert.ok(screen.getByText('Review findings (1)'));assert.ok(screen.getByText(/Network calibration: Handle/));
 rerender(React.createElement(PaperQualityFeedback,{quality:{...quality,phase:'needs_attention',round:1},step:4}));assert.match(screen.getByRole('alert').textContent,/attention/);assert.equal(screen.getByText('Review findings (1)').parentElement.open,true);
 rerender(React.createElement(PaperQualityFeedback,{quality:{...quality,phase:'approved',findings:[]},step:4}));assert.equal(screen.queryByRole('alert'),null);assert.equal(screen.queryByRole('status'),null);assert.equal(screen.queryByText('Review findings (1)'),null);
});
