import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';

const hook=registerHooks({resolve(specifier,context,next){
  if(specifier==='server-only')return {shortCircuit:true,url:'data:text/javascript,export {};'};
  if(specifier==='next/server')return next('next/server.js',context);
  if(specifier==='./paper-intake-server')return {shortCircuit:true,url:'data:text/javascript,export const intakeDatabase=async()=>globalThis.__wizardProgressDatabase;'};
  return next(specifier,context);
}});
const {GET}=await import('../app/(modules)/research-verification/api/assessment-progress/route.ts');hook.deregister();
const uid=index=>'00000000-0000-4000-8000-'+String(index).padStart(12,'0');
const request=ids=>new Request('https://example.test/research-verification/api/assessment-progress?'+new URLSearchParams(ids.map(id=>['id',id])));
let records,calls,override;
beforeEach(()=>{
  calls=[];override=()=>null;
  records={research_studies:[{id:uid(1),study_kind:'paper',deleted_at:null}],research_paper_intakes:[],research_experiment_plans:[],research_paper_reviews:[],research_autonomy_workflows:[],research_experiment_plan_link_reviews:[],research_skill_submissions:[]};
  globalThis.__wizardProgressDatabase={from(table){
    assert.ok(Object.hasOwn(records,table));const query={table,filters:[]};calls.push(query);
    const builder={select(columns,options){query.columns=columns;query.count=options.count;return builder;},in(key,values){query.filters.push([key,'in',values]);return builder;},eq(key,value){query.filters.push([key,'eq',value]);return builder;},is(key,value){query.filters.push([key,'is',value]);return builder;},not(key,op,value){query.filters.push([key,`not.${op}`,value]);return builder;},limit(value){query.limit=value;return builder;},then(resolve,reject){
      const special=override(query);
      if(special)return Promise.resolve(special).then(resolve,reject);
      const rows=records[table].filter(row=>query.filters.every(([key,op,value])=>{
        const field=key.split('->').reduce((entry,part)=>entry?.[part],row);
        if(op==='not.is')return (field??null)!==value;
        return op==='in'?value.includes(field):field===value;
      }));
      const data=rows.slice(0,query.limit).map(row=>Object.fromEntries(query.columns.split(',').map(key=>[key,row[key]])));
      return Promise.resolve({data,count:rows.length,error:null}).then(resolve,reject);
    }};return builder;
  }};
});

test('anonymous progress maps saved upload review confirmation and plan readiness to four steps',async()=>{
  const ids=Array.from({length:9},(_,i)=>uid(i+1));records.research_studies=ids.map(id=>({id,study_kind:'paper',deleted_at:null}));
  records.research_paper_intakes=ids.slice(0,7).map((study_id,i)=>({study_id,status:['uploaded','processing','ready','ready','ready','failed','uncertain'][i],breakdown:'PRIVATE EVIDENCE',owner_id:'PRIVATE OWNER'}));
  records.research_experiment_plans=[{study_id:uid(4),status:'processing',plan:'PRIVATE PLAN'},{study_id:uid(5),status:'ready'}];
  records.research_paper_reviews=[{study_id:uid(8),status:'confirmed'}];records.research_autonomy_workflows=[{study_id:uid(9)}];
  const response=await GET(request(ids));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const value=await response.json();assert.deepEqual(value.assessments.map(item=>item.step),[1,2,2,3,4,2,2,3,4]);assert.ok(!JSON.stringify(value).includes('PRIVATE'));
  assert.equal(calls.length,6);assert.ok(calls.every(query=>query.count==='exact'&&!query.columns.includes('*')&&query.limit<=11));
  assert.deepEqual(calls[0].filters,[['id','in',ids],['study_kind','eq','paper'],['deleted_at','is',null]]);
});
test('failed uncertain and cancelled planning stays on step three rather than restarting review',async()=>{
  const ids=[uid(1),uid(2),uid(3)];records.research_studies=ids.map(id=>({id,study_kind:'paper',deleted_at:null}));
  records.research_experiment_plans=ids.map((study_id,i)=>({study_id,status:['failed','uncertain','cancelled'][i]}));
  assert.deepEqual((await(await GET(request(ids))).json()).assessments.map(item=>item.step),[3,3,3]);
});
test('complete local imports reach step four through a bounded metadata projection',async()=>{
  let local={study_id:uid(1),status:'confirmed',local_version:'local-codex-assessment-v1',local_steps:[2,3,4]};
  override=query=>query.table==='research_paper_reviews'?{data:[local],count:1,error:null}:null;
  const value=await(await GET(request([uid(1)]))).json();assert.equal(value.assessments[0].step,4);
  assert.ok(!JSON.stringify(value).includes('local_version'));assert.ok(!JSON.stringify(value).includes('local_steps'));
  for(const patch of [{local_version:'unknown'},{local_steps:[2,3]},{status:'ready'}]){
    local={study_id:uid(1),status:'confirmed',local_version:'local-codex-assessment-v1',local_steps:[2,3,4],...patch};
    assert.notEqual((await(await GET(request([uid(1)]))).json()).assessments[0].step,4);
  }
});
test('only shared JumpServe submissions with wizard data report step four',async()=>{
  records.research_studies.push({id:uid(2),study_kind:'paper',deleted_at:null},{id:uid(3),study_kind:'paper',deleted_at:null});
  records.research_skill_submissions=[{study_id:uid(1),bundle:{wizard:{}}},{study_id:uid(2),bundle:{}},{id:uid(3),study_id:null,bundle:{wizard:{}}}];
  const response=await GET(request([uid(1),uid(2),uid(3)]));assert.equal(response.status,200);
  assert.deepEqual((await response.json()).assessments.map(item=>item.step),[4,null,null]);
  assert.equal(calls.find(query=>query.table==='research_skill_submissions').columns,'study_id');
  override=query=>query.table==='research_skill_submissions'?{data:null,count:null,error:{code:'PGRST205'}}:null;
  assert.equal((await GET(request([uid(1)]))).status,200);
});
test('ideas deleted papers missing records and unknown progress never reveal a guessed step',async()=>{
  records.research_studies.push({id:uid(2),study_kind:'idea',deleted_at:null},{id:uid(3),study_kind:'paper',deleted_at:'2026-11-14T00:00:00Z'});
  records.research_paper_intakes=[{study_id:uid(2),status:'ready'},{study_id:uid(3),status:'processing'}];
  const response=await GET(request([uid(1),uid(2),uid(3),uid(4)]));assert.equal(response.status,200);
  assert.deepEqual((await response.json()).assessments.map(item=>item.step),[null,null,null,null]);
  assert.ok(calls.slice(1).every(query=>JSON.stringify(query.filters[0])==JSON.stringify(['study_id','in',[uid(1)]])));
});
test('an immutable reviewed projection advances progress only for its exact original plan revision',async()=>{
  records.research_experiment_plans=[{study_id:uid(1),status:'failed',revision:4}];
  records.research_experiment_plan_link_reviews=[{study_id:uid(1),base_revision:4}];
  assert.equal((await(await GET(request([uid(1)]))).json()).assessments[0].step,4);
  records.research_experiment_plan_link_reviews[0].base_revision=3;
  assert.equal((await GET(request([uid(1)]))).status,503);
  records.research_experiment_plan_link_reviews=[];
  override=query=>query.table==='research_experiment_plan_link_reviews'?{data:null,count:null,error:{code:'PGRST205'}}:null;
  assert.equal((await(await GET(request([uid(1)]))).json()).assessments[0].step,3);
});
test('invalid duplicate excess or arbitrary query inputs do not access the database',async()=>{
  for(const ids of [[],['bad'],[uid(1),uid(1)],Array.from({length:11},(_,i)=>uid(i+1))])assert.equal((await GET(request(ids))).status,400);
  assert.equal((await GET(new Request(request([uid(1)]).url+'&owner_id=forged'))).status,400);assert.equal(calls.length,0);
});
test('truncated duplicate foreign or failed database results report unavailable rather than an earlier step',async()=>{
  for(const result of [{data:[],count:1,error:null},{data:[{study_id:uid(1),status:'ready'},{study_id:uid(1),status:'ready'}],count:2,error:null},{data:[{study_id:uid(2),status:'ready'}],count:1,error:null},{data:null,count:null,error:{message:'PRIVATE SQL DETAILS'}}]){
    override=query=>query.table==='research_experiment_plans'?result:null;
    const response=await GET(request([uid(1)]));assert.equal(response.status,503);assert.equal(JSON.stringify(await response.json()).includes('PRIVATE'),false);
  }
});
test('deletion filtering only falls back for a definitive pre-migration missing column',async()=>{
  override=query=>query.table==='research_studies'&&query.filters.some(([key])=>key==='deleted_at')?{data:null,count:null,error:{code:'42703',message:'column research_studies.deleted_at does not exist'}}:null;
  assert.equal((await GET(request([uid(1)]))).status,200);assert.equal(calls.filter(query=>query.table==='research_studies').length,2);
  calls=[];override=query=>query.table==='research_studies'?{data:null,count:null,error:{code:'42501',message:'Permission denied'}}:null;
  assert.equal((await GET(request([uid(1)]))).status,503);assert.equal(calls.length,1);
});
