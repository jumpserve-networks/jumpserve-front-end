import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import React from 'react';
import {cleanup,render,screen,within} from '@testing-library/react';
import {PaperBreakdownPanel} from '../app/components/research-workflow/paper-breakdown.tsx';
import {evidenceBreakdown} from './support/paper-evidence-fixture.mjs';
afterEach(cleanup);

test('review shows fabricated provenance, reported values and every supporting PDF page',()=>{
 const b=evidenceBreakdown();b.review={id:'review',revision:5,reviewed_at:'2026-11-11T12:00:00Z',reason:'Correct source evidence.',reviewer_type:'AI'};
 render(React.createElement(PaperBreakdownPanel,{version:b.version,value:b,preparing:false,busy:false}));
 assert.ok(screen.getByText('Synthetic document: reported benchmark results are fabricated.'));
 assert.ok(screen.getByText('Paper-reported result · Fabricated benchmark value'));
 assert.ok(screen.getByText('Reviewed version 5 · AI document review. Original extraction retained.'));
 assert.ok(screen.getByRole('heading',{name:'Implementation choices to resolve'}));
 const exp=screen.getByRole('region',{name:'Experiment'});
 assert.ok(within(exp).getByText(b.sections.experiment[0].specification.comparisons));
 for(const page of [1,2])assert.ok(within(exp).getByText(`PDF page ${page}`));
 assert.equal(screen.getAllByText(/Needs an operational definition before execution/).length,2);
 assert.ok(screen.getByText(/Use the paper-defined comparison/));
 assert.equal(screen.queryByText(/One model pass over/),null);
});
