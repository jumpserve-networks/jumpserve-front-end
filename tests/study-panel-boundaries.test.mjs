import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {JSDOM} from 'jsdom';
import {RECORD_KINDS} from '../lib/research-workflow.ts';
globalThis.__panelReact=React;
const boundary=name=>`export function ${name}(props){globalThis.__panelCaptures.push({name:${JSON.stringify(name)},props});return globalThis.__panelReact.createElement('section',{'data-child':${JSON.stringify(name)}});}`;
const replacements={
 'next/link':"export default function Link(props){return globalThis.__panelReact.createElement('a',props);}",
 '@/app/components/user-preferences':"export const LocalDateTime=({value})=>globalThis.__panelReact.createElement('time',{},value);",
 './run-gap-experiment':boundary('RunGapExperiment'),
 '@/app/components/research-workflow/comparisons':boundary('NumericalComparisons'),
 './benchmark-form':boundary('BenchmarkForm'),
 './benchmark-status':boundary('BenchmarkStatus'),
 './sign-in-to-run':boundary('SignInToRun'),
};
const hooks=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {StudyPanel,studyView,STUDY_VIEWS}=await import('../app/components/research-workflow/study-panel.tsx');const {BenchmarkTabs}=await import('../app/components/benchmark-tabs.tsx');
const {default:BenchmarkError}=await import('../app/(modules)/congestion-control-emulated/benchmarks/[jobId]/error.tsx');const {default:StudyError}=await import('../app/(modules)/propagation-delay-study/error.tsx');const {default:BenchmarkMissing}=await import('../app/(modules)/congestion-control-emulated/benchmarks/[jobId]/not-found.tsx');const {default:BenchmarkLoading}=await import('../app/(modules)/congestion-control-emulated/benchmarks/[jobId]/loading.tsx');const {default:StudyLoading}=await import('../app/(modules)/propagation-delay-study/loading.tsx');hooks.deregister();
afterEach(cleanup);
function snapshot(){return{access:'published-snapshot',study:{id:'study',title:'Original paper',scope:'Original bounded scope',study_kind:'paper',origin_module:'propagation-delay-study'},records:Object.fromEntries(RECORD_KINDS.map(kind=>[kind,[]])),coverage:Object.fromEntries(RECORD_KINDS.map(kind=>[kind,0]))};}
const documentOf=element=>new JSDOM(renderToStaticMarkup(element)).window.document;
test('large snapshots label every visible page limit while keeping complete records available for export',()=>{
 const data=snapshot(),r=data.records;const records=kind=>Array.from({length:101},(_,index)=>({id:kind+'-'+index,created_at:new Date(Date.UTC(2026,10,8)+index*1000).toISOString()}));r.claims=records('claim');r.sources=records('source');r.summaries=records('summary');r.gaps=records('gap').map((row,index)=>({...row,claim_id:r.claims[index].id,status:'open',priority:1}));r.campaigns=[{id:'campaign',title:'Original campaign'}];r.claim_checks=[{id:'check',campaign_id:'campaign'}];
 for(const [view,label]of [['results',/Showing 100 of 101 summaries/],['literature',/Showing 100 of 101 sources/],['gaps',/Showing 100 of 101 current gaps/]]){globalThis.__panelCaptures=[];const document=documentOf(React.createElement(StudyPanel,{snapshot:data,view,basePath:'/original'}));assert.match(document.body.textContent,label);if(view==='results')assert.match(document.body.textContent,/Showing 100 of 101 claims/);}
 data.study.study_kind='idea';globalThis.__panelCaptures=[];const document=documentOf(React.createElement(StudyPanel,{snapshot:data,view:'methods',basePath:'/original'}));assert.equal(document.querySelector('a[href*="experiment-design"]'),null);
});
test('study view selection accepts only the declared evidence views and empty snapshots retain explicit gaps',()=>{
 assert.equal(studyView('private'),'results');assert.equal(studyView(['gaps']),'results');for(const view of STUDY_VIEWS){globalThis.__panelCaptures=[];const document=documentOf(React.createElement(StudyPanel,{snapshot:snapshot(),view,basePath:'/original-study'}));assert.equal(studyView(view),view);assert.equal(document.querySelector('[aria-current="page"]').getAttribute('href'),'/original-study?view='+view);assert.match(document.body.textContent,/Original bounded scope/);assert.equal(document.querySelectorAll('nav a').length,4);}
});
test('populated public study panels retain sources protocols claims findings and prospective gap actions',()=>{
 const data=snapshot(),r=data.records;const base={created_at:'2026-11-08T00:00:00Z'};r.sources=[{...base,id:'source',citation:'Original source',source_url:'https://example.test/original',reviewer:{identity:'Original reviewer',type:'human',independence:'Declared scope'}},{...base,id:'missing-source',citation:'Missing paper',kind:'paper'},{...base,id:'proposal',citation:'Original unpublished proposal',kind:'unpublished-proposal'}];r.claims=[{...base,id:'claim',description:'Original exact claim',location:'Original section',claim_type:'numerical'},{...base,id:'untested',description:'Untested original claim'}];r.assessments=[{...base,id:'assessment',claim_id:'claim',label:'inconclusive',justification:'Original finding',reviewer:{}}];r.gaps=[{...base,id:'gap',claim_id:'claim',status:'open',priority:5,reason:'Original missing evidence',estimated_cost_usd:0},{...base,id:'missing-gap',claim_id:'absent',status:'blocked',priority:1}];r.protocols=[{...base,id:'protocol',version:1,document:{original:true},sha256:'a'.repeat(64)}];r.campaigns=[{...base,id:'campaign',title:'Original campaign'}];r.publications=[{id:'publication',version:2}];
 for(const view of STUDY_VIEWS){globalThis.__panelCaptures=[];const document=documentOf(React.createElement(StudyPanel,{snapshot:data,view,basePath:'/original'}));assert.match(document.body.textContent,/Published snapshot · version 2/);if(view==='literature'){assert.equal(document.querySelector('a[href="https://example.test/original"]').textContent,'Original resource');assert.match(document.body.textContent,/Source URL unavailable/);assert.match(document.body.textContent,/unpublished proposal; no paper URL/);}if(view==='gaps'){assert.match(document.body.textContent,/Original missing evidence/);assert.match(document.body.textContent,/Claim reference unavailable/);assert.equal(globalThis.__panelCaptures.filter(c=>c.name==='RunGapExperiment').length,2);}}
});
test('private idea snapshots keep proposed work separate and never offer paper gap execution',()=>{
 const data=snapshot();data.access='owner-draft';data.study.study_kind='idea';data.study.origin_module=null;data.records.gaps=[{id:'gap',claim_id:'absent',status:'planned',priority:0,created_at:'2026-11-08'}];globalThis.__panelCaptures=[];const document=documentOf(React.createElement(StudyPanel,{snapshot:data,view:'gaps',basePath:'/idea'}));assert.match(document.body.textContent,/Private workspace/);assert.match(document.body.textContent,/Unpublished research idea/);assert.equal(globalThis.__panelCaptures.filter(c=>c.name==='RunGapExperiment').length,0);
});
test('an idea claim shows its recorded finding without a paper-claim design action',()=>{
 const data=snapshot();data.study.study_kind='idea';data.records.claims=[{id:'claim',description:'Original idea claim',created_at:'2026-11-08'}];globalThis.__panelCaptures=[];const document=documentOf(React.createElement(StudyPanel,{snapshot:data,view:'results',basePath:'/idea'}));assert.match(document.body.textContent,/Original idea claim/);assert.equal(document.querySelector('a[href*="design-claim"]'),null);
});
test('benchmark tabs keep public run history and require sign-in only for execution',async()=>{
 for(const signedIn of [false,true]){globalThis.__panelCaptures=[];render(React.createElement(BenchmarkTabs,{userEmail:signedIn?'synthetic@example.test':undefined}));assert.ok(document.querySelector('[data-child="'+(signedIn?'BenchmarkForm':'SignInToRun')+'"]'));await act(async()=>fireEvent.click(screen.getByRole('tab',{name:'Run History'})));const status=globalThis.__panelCaptures.findLast(c=>c.name==='BenchmarkStatus');assert.equal(status.props.canManage,signedIn);cleanup();}
});
test('benchmark and study failure boundaries preserve explicit retry and module navigation',async()=>{
 for(const Component of [BenchmarkError,StudyError]){let retries=0;render(React.createElement(Component,{reset:()=>retries++}));assert.ok(screen.getByRole('heading',{level:1}));await act(async()=>fireEvent.click(screen.getByRole('button',{name:/Try again|Retry/})));assert.equal(retries,1);cleanup();}
 for(const Component of [BenchmarkMissing,BenchmarkLoading,StudyLoading]){const document=documentOf(React.createElement(Component));assert.ok(document.body.textContent.length>0);}
});
