import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {sha256} from '../lib/paper-intake-model.ts';

const hook=registerHooks({resolve(specifier,context,next){
 if(specifier==='server-only')return{shortCircuit:true,url:'data:text/javascript,export {}'};
 if(specifier==='openai')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export default class OpenAI{static APIError=class APIError extends Error{};constructor(options){globalThis.__intakeTest.modelOptions=options;this.responses=globalThis.__intakeTest.responses;}}')};
 if(specifier==='@supabase/supabase-js')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export const createClient=()=>globalThis.__intakeTest.db;')};
 return next(specifier,context);
}});
const {prepareIntake,intakeView,intakeActor,loadIntake,ownerIntakes}=await import('../lib/paper-intake-server.ts');hook.deregister();
function fixturePDF(){
 const content='BT /F1 12 Tf 40 200 Td (Explicit Access PDF parsing fixture; no academic claims.) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream'];
 let raw='%PDF-1.4\n';const offsets=[];objects.forEach((body,index)=>{offsets.push(Buffer.byteLength(raw));raw+=(index+1)+' 0 obj\n'+body+'\nendobj\n';});
 const start=Buffer.byteLength(raw);raw+='xref\n0 6\n0000000000 65535 f \n';for(const offset of offsets)raw+=String(offset).padStart(10,'0')+' 00000 n \n';
 return Buffer.from(raw+'trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n'+start+'\n%%EOF\n');
}
const original=fixturePDF();
let state;
beforeEach(()=>{
 process.env.OPENAI_API_KEY='synthetic-server-key';process.env.SUPABASE_SECRET_KEY='synthetic-supabase-key';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.test';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-public-key';
 state=globalThis.__intakeTest={calls:[],objects:new Map(),row:{study_id:'10000000-0000-4000-8000-000000000001',owner_id:'verified-owner',filename:'paper.pdf',sha256:sha256(original),byte_count:original.length,status:'uploaded',source_id:'20000000-0000-4000-8000-000000000001',original_artifact_id:'30000000-0000-4000-8000-000000000001',text_artifact_id:'40000000-0000-4000-8000-000000000001',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),title:null,authors:[],domain:null,reason:null,breakdown:null}};
 state.responses={create:async(request,options)=>{state.calls.push(['model',request,options]);return{id:'resp_original',status:'queued'};}};
 state.db={auth:{getUser:async token=>({data:{user:token==='verified'?{id:'verified-owner',app_metadata:{provider:'google'}}:null},error:null})},storage:{from:bucket=>({download:async path=>({data:new Blob([bucket==='research-paper-uploads'?original:state.objects.get(path)]),error:null}),upload:async(path,bytes,options)=>{assert.equal(options.upsert,false);state.objects.set(path,bytes);return{error:null};}})},rpc:async(name,args)=>{
  assert.equal(name,'research_paper_intake');state.calls.push([args.p_operation,args.p_payload]);
  if(args.p_operation==='begin'){if(state.row.status!=='uploaded')return{data:{...state.row,admitted:false},error:null};Object.assign(state.row,{...args.p_payload,status:'submitting',submit_token:'original-token',admitted:true});}
  if(args.p_operation==='submitted')Object.assign(state.row,{status:'processing',provider_response_id:args.p_payload.response_id});
  if(args.p_operation==='uncertain')Object.assign(state.row,{status:'uncertain'});
  return{data:structuredClone(state.row),error:null};
 },from:()=>({select:()=>({eq:async()=>({count:0,error:null})})})};
});
test('real PDF extraction retains exact artifacts and makes one server-side background call',async()=>{
 const result=await prepareIntake({...state.row});assert.equal(result.status,'processing');assert.deepEqual(state.calls.map(c=>c[0]),['begin','model','submitted']);assert.equal(state.modelOptions.maxRetries,0);assert.equal(state.modelOptions.apiKey,'synthetic-server-key');const admission=state.calls[0][1];assert.equal(admission.artifacts[0].sha256,sha256(original));assert.equal(admission.artifacts[1].sha256,sha256(JSON.stringify(admission.paper_text)));assert.ok(admission.paper_text.totalPages>0);assert.ok(admission.paper_text.pages.some(p=>p.text.includes('Access')));assert.equal(state.calls[1][1].background,true);assert.equal(JSON.stringify(admission).includes('synthetic-server-key'),false);
});
test('simultaneous preparations admit only one inference and an acknowledgement retry never repeats it',async()=>{
 const rpc=state.db.rpc;let lost=true;state.db.rpc=async(name,args)=>{const result=await rpc(name,args);if(args.p_operation==='submitted'&&lost){lost=false;return{error:{message:'Lost DB response'}};}return result;};await Promise.all([prepareIntake({...state.row}),prepareIntake({...state.row})]);assert.equal(state.calls.filter(c=>c[0]==='model').length,1);assert.equal(state.calls.filter(c=>c[0]==='submitted').length,2);
});
test('ambiguous OpenAI failures retain one uncertain original call without automatic submission retry',async()=>{
 state.responses.create=async()=>{state.calls.push(['model']);throw new Error('Lost provider response');};const result=await prepareIntake({...state.row});assert.equal(result.status,'uncertain');await prepareIntake(result);assert.equal(state.calls.filter(c=>c[0]==='model').length,1);assert.equal(state.calls.at(-1)[0],'uncertain');
});
test('a rejected prompt-recording transaction stops preparation before the provider is called',async()=>{
 state.db.rpc=async()=>({error:{message:'The exact prompt version could not be recorded'}});
 await assert.rejects(()=>prepareIntake({...state.row}),/exact prompt version could not be recorded/);
 assert.equal(state.calls.some(call=>call[0]==='model'),false);
});
test('missing credentials and mismatched original bytes fail before admitting a model call',async()=>{
 delete process.env.OPENAI_API_KEY;await assert.rejects(()=>prepareIntake({...state.row}),/OPENAI_API_KEY/);assert.equal(state.calls.length,0);process.env.OPENAI_API_KEY='synthetic-server-key';await assert.rejects(()=>prepareIntake({...state.row,sha256:'a'.repeat(64)}),/original upload identity/);assert.equal(state.calls.length,0);
});
test('Google access tokens are verified and public views contain no paper text quotes paths or owner identity',async()=>{
 assert.equal(await intakeActor(new Request('https://example.test')),null);assert.equal(await intakeActor(new Request('https://example.test',{headers:{authorization:'Bearer unverified'}})),null);assert.equal(await intakeActor(new Request('https://example.test',{headers:{authorization:'Bearer verified'}})),'verified-owner');const view=await intakeView({...state.row,status:'processing',title:'PRIVATE TITLE',breakdown:{private:'SOURCE QUOTE'},reason:'PRIVATE REASON'});assert.equal(view.owner,false);assert.equal(view.title,null);assert.equal(view.breakdown,null);assert.equal(view.reason,null);assert.equal(JSON.stringify(view).includes('verified-owner'),false);assert.equal(view.experiment_jobs,0);
});

function availabilityQueries({legacy=false,deleted=false,failure=null}={}){
 state.reads=[];
 state.db.from=table=>{
  const filters=[];
  const result=single=>{
   state.reads.push({table,filters:structuredClone(filters)});
   const deletion=filters.some(filter=>filter[0]==='is'&&filter[1].endsWith('deleted_at'));
   if(failure&&table==='research_studies')return{data:null,error:failure};
   if(legacy&&deletion)return{data:null,error:{code:'42703',message:'column research_studies.deleted_at does not exist'}};
   const study={id:state.row.study_id,title:'Saved title',study_kind:'paper',created_at:state.row.created_at};
   const data=table==='research_studies'?deleted?[]:[study]:table==='research_study_owners'?[{study_id:state.row.study_id}]:table==='research_paper_reviews'?[]:single?[structuredClone(state.row)]:[];
   return{data:single?data[0]??null:data,error:null};
  };
  const query={select(){return query;},eq(...args){filters.push(['eq',...args]);return query;},is(...args){filters.push(['is',...args]);return query;},in(...args){filters.push(['in',...args]);return query;},limit(){return query;},order(){return query;},maybeSingle:async()=>result(true),then:(resolve,reject)=>Promise.resolve(result(false)).then(resolve,reject)};
  return query;
 };
}

test('ready assessments load before the deletion migration and retain the original owner restriction',async()=>{
 availabilityQueries({legacy:true});state.row.status='ready';
 const result=await loadIntake(state.row.study_id,state.row.owner_id);
 assert.equal(result.status,'ready');assert.deepEqual(state.reads.map(read=>read.table),['research_studies','research_studies','research_paper_intakes']);
 assert.ok(state.reads.at(-1).filters.some(filter=>filter[1]==='owner_id'&&filter[2]===state.row.owner_id));assert.equal(state.calls.length,0);
});
test('a deleted assessment is never read from the private intake relation',async()=>{
 availabilityQueries({deleted:true});assert.equal(await loadIntake(state.row.study_id),null);
 assert.deepEqual(state.reads.map(read=>read.table),['research_studies']);assert.ok(state.reads[0].filters.some(filter=>filter[0]==='is'&&filter[1]==='deleted_at'));
});
test('owner notifications also work before the deletion migration without starting model work',async()=>{
 availabilityQueries({legacy:true});const result=await ownerIntakes(state.row.owner_id);
 assert.equal(result.access,'owner-drafts');assert.deepEqual(result.studies.map(study=>study.id),[state.row.study_id]);
 assert.equal(state.reads.filter(read=>read.table==='research_study_owners').length,2);assert.equal(state.reads.filter(read=>read.table==='research_studies').length,2);assert.equal(state.calls.length,0);
});
test('an unexpected availability failure reports its code without loading private paper data',async()=>{
 availabilityQueries({failure:{code:'42501',message:'Private database diagnostics'}});
 await assert.rejects(loadIntake(state.row.study_id),/Assessment availability could not be checked \(database code 42501\)/);
 assert.deepEqual(state.reads.map(read=>read.table),['research_studies']);
});
