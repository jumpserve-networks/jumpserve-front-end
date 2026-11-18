import {evidencePaper,evidenceBreakdown,evidencePlan} from './paper-evidence-fixture.mjs';
import {experimentScriptsFixture,hierarchicalImplementationPlan,implementationBreakdown} from './experiment-scripts-fixture.mjs';
import {qualityAttachment} from '../../lib/paper-quality-model.ts';
import {qualitySandboxProgram,QUALITY_SANDBOX_MARKER} from '../../lib/paper-quality-sandbox.ts';
const id='11111111-1111-4111-8111-111111111111';
export const passReview=()=>({decision:'pass',summary:'Source and implementation checks passed.',findings:[]});
export const reviseReview=()=>({decision:'revise',summary:'A concrete implementation issue requires repair.',findings:[{id:'zero-delay',severity:'blocking',location:'verify_qdisc',explanation:'Accept the verified netem zero-delay representation.',evidence:'The current parser rejects an omitted zero delay.'}]});
export function qualitySource(step=3){
 const breakdown=step===4?implementationBreakdown():evidenceBreakdown();
 return{study_id:id,step,experiment_index:step===4?1:0,paper:evidencePaper,confirmed_breakdown:step===2?null:breakdown,plan:step===4?hierarchicalImplementationPlan():null,candidate:step===2?{breakdown,title:null,authors:[],domain:null}:step===3?evidencePlan():experimentScriptsFixture()};
}
export function qualityRow(step=3){const source=qualitySource(step);return{id:'22222222-2222-4222-8222-222222222222',study_id:id,owner_id:'owner',step,experiment_index:step===4?1:0,status:'review_pending',phase:'reviewing',round:0,source_json:source,candidate:structuredClone(source.candidate),original_request:{model:'gpt-5.4-2026-03-05',instructions:'Original frozen generation instructions.',input:'Original frozen inputs.',text:{format:{type:'json_schema',name:'original_fixture',strict:true,schema:{type:'object'}}}},deadline_at:'2099-01-01T00:00:00Z',updated_at:'2026-11-18T12:00:00Z',source_revision:4,source_provider_id:'resp_original_draft',review:null,checks:null,reason:null,call:null};}
export function qualityResponse(review=passReview(),source){
 const output=[];
 if(source?.step===4){const hash=qualityAttachment(source).hash,result={source_sha256:hash,platform:'Linux',passed:true,syntax:[{language:'bash',passed:true}],behavior:{exit_code:0,test_count:7,candidate_unchanged:true,categories:['normal','boundary','missing_data','prerequisites','failure','cleanup','zero_delay']},errors:[]};output.push({id:'ci_fixture',type:'code_interpreter_call',status:'completed',container_id:'cntr_fixture',code:qualitySandboxProgram(hash),outputs:[{type:'logs',logs:QUALITY_SANDBOX_MARKER+JSON.stringify(result)}]});}
 output.push({type:'message',content:[{type:'output_text',text:JSON.stringify(review)}]});return{id:'resp_quality_fixture',status:'completed',output};
}
export function qualityOperations(initial=qualityRow()){
 let current=structuredClone(initial),response=qualityResponse(),count=0;const events=[],requests=[];
 const ops={
  async save(operation,payload){events.push({operation,payload:structuredClone(payload)});
   if(operation==='admit'){if(!['review_pending','repair_pending'].includes(current.status))return{...current,admitted:false};const kind=current.status==='repair_pending'?'repair':'review';current={...current,status:'running',phase:kind==='repair'?'repairing':'reviewing',call:{id:'call_'+ ++count,kind,status:'preparing',submit_token:'token_'+count,provider_response_id:null,request:null,updated_at:new Date().toISOString()}};return{...structuredClone(current),admitted:true};}
   if(operation==='request')current.call={...current.call,request:payload.request,status:'submitting'};
   if(operation==='submitted')current.call={...current.call,status:'processing',provider_response_id:payload.response_id};
   if(operation==='uncertain'){current.status='uncertain';current.phase='uncertain';current.call.status='uncertain';}
   if(operation==='failed'){current.status='needs_attention';current.phase='needs_attention';current.reason=payload.reason;}
   if(operation==='reviewed'){current.review=payload.review;current.checks=payload.checks;current.call.status='completed';current.status=payload.review.decision==='pass'&&payload.checks.passed?'approved':current.round===0?'repair_pending':'needs_attention';current.phase=current.status==='repair_pending'?'repairing':current.status;}
   if(operation==='repaired'){current.candidate=payload.candidate;current.checks=payload.checks;current.round=1;current.status='review_pending';current.phase='reviewing';current.call.status='completed';}
   if(operation==='cancel'){current.status='cancelled';current.phase='cancelled';}
   return structuredClone(current);
  },
  upload:async()=> 'file-fixture',
  create:async(request,token)=>{if(current.call.request===null)throw Error('Request not saved');requests.push({request,token});return{id:'resp_call_'+count,status:'queued',output:[]};},
  retrieve:async id=>({...response,id}),cancel:async id=>({id,status:'cancelled',output:[]}),parseRepair:()=>structuredClone(current.source_json.candidate),
 };
 return{ops,events,requests,row:()=>structuredClone(current),response:value=>{response=value;}};
}
