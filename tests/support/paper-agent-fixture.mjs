import {qualityRow,reviseReview} from './paper-quality-fixture.mjs';
import {deterministicQualityChecks} from '../../lib/paper-quality-checks.ts';
export function agentRow(step=2){
 const row=qualityRow(step);row.status='running';row.phase='repairing';row.review=reviseReview();row.checks=deterministicQualityChecks(row.source_json);
 row.call={id:'33333333-3333-4333-8333-333333333333',kind:'repair',status:'preparing',position:2,provider_type:'managed_agent',submit_token:'44444444-4444-4444-8444-444444444444',provider_response_id:null,request:null,updated_at:'2026-11-18T12:00:00Z'};
 row.review_context={version:'paper-quality-context-v1',generation_instructions:row.original_request.instructions,generation_input:row.original_request.input,reference_map:{},finding_ledger:[],prior_resolutions:[],previous_candidate:null};
 row.agent={call_id:row.call.id,workflow_id:row.id,study_id:row.study_id,owner_id:row.owner_id,submit_token:row.call.submit_token,status:'preparing',provider_session_id:null,request:null,initial_candidate:structuredClone(row.candidate),candidate:structuredClone(row.candidate),candidate_version:0,session:null,turn:null,cancel_requested_at:null,deadline_at:'2099-01-01T00:00:00Z',created_at:'2026-11-18T12:00:00Z',updated_at:'2026-11-18T12:00:00Z'};
 return row;
}
export function agentSession(row,id='sess_fixture'){
 return{id,metadata:{runtime:'managed-agents-v1',call_id:row.call.id,submit_token:row.call.submit_token},agent:{model:'gpt-5.4',reasoning:{effort:'medium'},multi_agent:{enabled:false}},environment:{type:'none'},status:'in_progress',required_actions:[]};
}
export function agentOperations(initial=agentRow()){
 let current=structuredClone(initial),session=agentSession(current),turn=null,found=[],limit=true,claimError=null,resultError=null;let creations=0;const events=[],claims=new Map();
 const state=()=>structuredClone(current);
 const ops={
  async save(operation,payload){events.push({operation,payload:structuredClone(payload)});
   if(operation==='request'){current.agent.request=payload.request;current.agent.status='submitting';current.call.status='submitting';}
   if(operation==='submitted'){current.agent.provider_session_id=payload.session.id;current.agent.session=payload.session;current.agent.status='processing';current.call.status='processing';current.status='running';}
   if(operation==='observed'){current.agent.session=payload.session;if(payload.turn)current.agent.turn=payload.turn;}
   if(operation==='uncertain'){current.agent.status='uncertain';current.call.status='uncertain';current.status='uncertain';}
   if(operation==='cancel_requested')current.agent.cancel_requested_at='2026-11-18T12:10:00Z';
   if(operation==='action_result'){const claim=[...claims.values()].find(c=>c.id===payload.action_id);claim.result=payload.result;if(payload.candidate){current.agent.candidate=payload.candidate;current.agent.candidate_version++;}}
   if(operation==='completed'){current.candidate=current.agent.candidate;current.call.status='completed';current.agent.status='completed';current.round++;current.status='review_pending';current.phase='reviewing';}
   if(operation==='failed'||operation==='cancelled'){current.agent.status=operation;current.call.status=operation;current.status=operation==='failed'?'needs_attention':'cancelled';current.reason=payload.reason;}
   return state();
  },
  async create(request,token){creations++;events.push({operation:'create',request,token});return structuredClone(session);},
  async retrieve(id){events.push({operation:'retrieve',id});return structuredClone(session);},
  async find(call,token){events.push({operation:'find',call,token});return structuredClone(found);},
  async turn(){return structuredClone(turn);},async items(){return[{type:'message',content:[{type:'output_text',text:'A provider assertion is not independent approval.'}]}];},
  async result(...args){events.push({operation:'result',args});if(resultError)throw resultError;},async cancel(...args){events.push({operation:'provider_cancel',args});},
  async claim({action}){if(claimError)throw claimError;let claim=claims.get(action.call_id);if(!claim){claim={...action,id:'local-'+action.call_id,lease_token:'lease-'+action.call_id,admitted:true,candidate_version:current.agent.candidate_version,result:null};claims.set(action.call_id,claim);}return{...structuredClone(claim),workflow:state()};},
  async limits(){return limit;},now:()=>Date.parse('2026-11-18T12:01:00Z'),
 };
 return{ops,events,state,creations:()=>creations,session:value=>{session=value;},turn:value=>{turn=value;},found:value=>{found=value;},limit:value=>{limit=value;},claimError:value=>{claimError=value;},resultError:value=>{resultError=value;}};
}
