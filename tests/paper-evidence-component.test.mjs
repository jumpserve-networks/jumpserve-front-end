import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import React from 'react';
import {cleanup,render,screen,within} from '@testing-library/react';
import {PaperBreakdownPanel} from '../app/components/research-workflow/paper-breakdown.tsx';
import {evidenceBreakdown} from './support/paper-evidence-fixture.mjs';
afterEach(cleanup);

test('review shows reported-value attribution and supporting PDF pages while omitting the provenance section',()=>{
 const b=evidenceBreakdown();b.review={id:'review',revision:5,reviewed_at:'2026-11-11T12:00:00Z',reason:'Correct source evidence.',reviewer_type:'AI'};
 render(React.createElement(PaperBreakdownPanel,{version:b.version,value:b,preparing:false,busy:false}));
 assert.equal(screen.queryByText('Synthetic document: reported benchmark results are fabricated.'),null);
 assert.ok(screen.getByText('Paper-reported result · Fabricated benchmark value'));
 assert.ok(screen.getByText('Reviewed version 5 · AI document review. Original extraction retained.'));
 assert.equal(screen.queryByRole('complementary',{name:'Document provenance'}),null);
 assert.equal(screen.queryByText(b.provenance.statement),null);
 assert.equal(screen.queryByRole('heading',{name:'Implementation choices to resolve'}),null);
 assert.equal(screen.queryByText(/The paper does not fix these implementation details/),null);
 for(const choice of b.implementation_choices)assert.equal(screen.queryByText(choice.name),null);
 const exp=screen.getByRole('region',{name:'Experiment'});
 for(const [field,detail] of Object.entries(b.sections.experiment[0].specification)){
  assert.equal(within(exp).queryByText(new RegExp(`^${field}$`,'i')),null);
  assert.equal(within(exp).queryByText(detail),null);
 }
 for(const page of [1,2])assert.ok(within(exp).getByText(`PDF page ${page}`));
 assert.equal(screen.getAllByText(/Needs an operational definition before execution/).length,2);
 assert.ok(screen.getByText(/Use the paper-defined comparison/));
 assert.equal(screen.queryByText(/One model pass over/),null);
});
