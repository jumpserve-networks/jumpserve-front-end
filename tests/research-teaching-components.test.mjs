import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {RECORD_KINDS} from '../lib/research-workflow.ts';
import {QUEUE_EXAMPLE,QUEUE_EXAMPLE_SNAPSHOT} from '../lib/research-queue-example.ts';
import {StudyPreparation} from '../app/components/research-workflow/preparation.tsx';
import {IdeaReviewSources} from '../app/components/research-ideas/idea-review-sources.tsx';
globalThis.__teachingReact=React;
const replacements={
 '@/app/components/research-workflow/select':"export function ResearchSelect({label,value,onChange,options}){return globalThis.__teachingReact.createElement('select',{'aria-label':label,value,onChange:event=>onChange(event.target.value)},options.map(option=>globalThis.__teachingReact.createElement('option',{key:option.value,value:option.value},option.label)));}",
 '@/app/components/research-workflow/claim-queue':"export function ClaimQueueView(props){globalThis.__teachingCapture=props;return globalThis.__teachingReact.createElement('section',{'aria-label':'Original claim queue'});}",
};
const hooks=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {QueueExample}=await import('../app/components/research-workflow/queue-example.tsx');hooks.deregister();
afterEach(cleanup);
const empty=()=>({...QUEUE_EXAMPLE_SNAPSHOT,records:Object.fromEntries(RECORD_KINDS.map(kind=>[kind,[]])),coverage:Object.fromEntries(RECORD_KINDS.map(kind=>[kind,0]))});
test('preparation controls open and focus the requested editor and safely tolerate missing editors',async t=>{
 Object.defineProperty(globalThis,'HTMLDetailsElement',{configurable:true,value:window.HTMLDetailsElement});let scrolled=0;const original=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollIntoView');Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:()=>scrolled++});t.after(()=>{if(original)Object.defineProperty(HTMLElement.prototype,'scrollIntoView',original);else delete HTMLElement.prototype.scrollIntoView;});
 const view=render(React.createElement(StudyPreparation,{snapshot:empty()}));const action=screen.getByRole('button');await act(async()=>fireEvent.click(action));assert.equal(scrolled,0);
 const details=document.createElement('details');details.id='research-records';details.innerHTML='<summary>Original source editor</summary>';document.body.append(details);t.after(()=>details.remove());
 await act(async()=>fireEvent.click(action));
 assert.equal(details.open,true);assert.equal(scrolled,1);assert.equal(document.activeElement,details.querySelector('summary'));
 assert.match(screen.getByRole('heading',{level:2}).textContent,/preparation required/);
 view.rerender(React.createElement(StudyPreparation,{snapshot:empty(),showActions:false}));assert.equal(screen.queryByRole('button'),null);
 const complete=empty();for(const kind of ['sources','claims','protocols','configurations'])complete.records[kind]=[{id:kind}];complete.records.campaigns=[{id:'campaign',protocol_id:'protocols'}];complete.records.claim_checks=[{id:'check',campaign_id:'campaign',applicability:'applicable'}];view.rerender(React.createElement(StudyPreparation,{snapshot:complete}));assert.match(screen.getByRole('heading',{level:2}).textContent,/Recorded campaign setup/);
});
test('queue examples label all data synthetic and distinguish empty intake unavailable and mixed work',async()=>{
 render(React.createElement(QueueExample));fireEvent.click(screen.getByText('Explore an illustrative claim queue'));assert.match(document.body.textContent,/Synthetic teaching example/);assert.equal(globalThis.__teachingCapture.queue,QUEUE_EXAMPLE);assert.equal(QUEUE_EXAMPLE.jobs.length,5);assert.equal(QUEUE_EXAMPLE_SNAPSHOT.coverage.claims,6);assert.ok(QUEUE_EXAMPLE.jobs.some(job=>job.status==='expired'));
 for(const value of ['empty','intake','unavailable','mixed']){await act(async()=>fireEvent.change(screen.getByRole('combobox',{name:'Queue example state'}),{target:{value}}));if(value==='unavailable')assert.match(screen.getByRole('alert').textContent,/Missing results are not zero/);else{assert.equal(globalThis.__teachingCapture.queue.jobs.length,value==='mixed'?5:0);assert.equal(globalThis.__teachingCapture.snapshot.records.claims.length,value==='intake'?0:6);}if(value==='intake'){assert.ok(screen.getByRole('region',{name:'Assessment preparation'}));assert.equal(screen.queryByRole('button'),null);}}
});
test('review declarations display verified original zero null empty missing and structured fields without HTML interpretation',()=>{
 const packet={id:'packet',version:3,sha256:'a'.repeat(64),document:{question:'<script>Original question</script>',conditions:'',metrics:0,hypothesis:null,protocol:{controls:['Original control']},custom:{zero:0}}};const field=(path,value,state='recorded')=>({path,value,present:true,state,value_sha256:'b'.repeat(64)});const run=fields=>({packet_id:'packet',provenance:{tool_events:[{name:'submit_idea_issues',executed:false,source_evidence:{version:'idea-review-sources-v2',packet_sha256:packet.sha256,fields}}]}});const documentOf=(run,selected=packet)=>new JSDOM(renderToStaticMarkup(React.createElement(IdeaReviewSources,{run,packet:selected}))).window.document;
 assert.equal(documentOf({provenance:{}}).body.textContent,'');assert.match(documentOf(run([])).body.textContent,/No individual fields/);const document=documentOf(run([field('/question',packet.document.question),field('/conditions','','empty'),field('/metrics',0),field('/hypothesis',null,'null'),field('/protocol/controls',packet.document.protocol.controls),field('/custom',packet.document.custom),{path:'/missing',present:false,state:'missing',value_sha256:null}]));assert.match(document.body.textContent,/plan version 3/);assert.equal(document.querySelector('script'),null);assert.equal(document.querySelector('[aria-label="Original /metrics"]').textContent,'0');assert.match(document.body.textContent,/Recorded empty string/);assert.match(document.body.textContent,/Recorded null/);assert.match(document.body.textContent,/Not recorded/);assert.match(document.body.textContent,/Plan field/);assert.match(documentOf(run([]),undefined).body.textContent,/No individual fields/);const invalid=documentOf(run([field('/question','changed')]));assert.match(invalid.querySelector('[role="alert"]').textContent,/differ from the original/);
});
