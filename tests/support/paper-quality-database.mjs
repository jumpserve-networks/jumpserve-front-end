// Deterministic fake provider records for the isolated SQL qualification fixture.
import {readFileSync} from 'node:fs';
import {evidencePaper,evidenceBreakdown,evidencePlan,evidenceResponse} from './paper-evidence-fixture.mjs';
import {experimentScriptsFixture} from './experiment-scripts-fixture.mjs';
import {paperModelRequest} from '../../lib/paper-intake-model.ts';
import {experimentPlanRequest} from '../../lib/paper-experiment-plan-model.ts';
import {experimentScriptsRequest} from '../../lib/paper-experiment-scripts-model.ts';
import {qualityAttachment,qualityReviewRequest,qualityRepairRequest,sandboxQualityChecks} from '../../lib/paper-quality-model.ts';
import {deterministicQualityChecks} from '../../lib/paper-quality-checks.ts';
import {qualityResponse,passReview,reviseReview} from './paper-quality-fixture.mjs';
const input=JSON.parse(readFileSync(0,'utf8'));
if(input.mode==='initial'){
 const b=input.breakdown??evidenceBreakdown(),old=b.source_id;b.source_id=input.source_id;b.text_artifact_id=input.text_artifact_id;
 for(const rows of Object.values(b.sections))for(const row of rows){row.id=row.id.replace(old,input.source_id);if(row.depends_on)row.depends_on=row.depends_on.map(id=>id.replace(old,input.source_id));}
 const p=input.plan??evidencePlan();for(const e of p.experiments)if(e.steps){e.stages=[{title:'Collect and evaluate',steps:e.steps}];delete e.steps;}
 const set=experimentScriptsFixture(),terminal=structuredClone(Object.values(set.actions).find(a=>a.kind==='terminal'));
 terminal.prerequisites=['setup'];set.actions=Object.fromEntries(['1.1.1','1.1.2','1.1.3'].map(ref=>[ref,ref==='1.1.2'?structuredClone(terminal):{kind:'blocked',commands:null,prerequisites:['setup'],verification:'No undefined scientific criterion is evaluated.',notes:'The frozen claim requires a scientific definition and remains blocked.',needs_sudo:false}]));
 console.log(JSON.stringify({paper:evidencePaper,breakdown:b,intake_request:paperModelRequest(evidencePaper),intake_response:evidenceResponse(),plan:p,plan_request:experimentPlanRequest(b),scripts:set,scripts_request:experimentScriptsRequest(input.study,1,p,b)}));
}else{
 const w=input.workflow,source={...w.source_json,candidate:w.candidate};
 if(input.mode==='review'){
  const report=input.review??(input.revise?reviseReview():passReview());if(w.review_context&&!('resolutions' in report))report.resolutions=w.review_context.finding_ledger.map(e=>({key:e.key,status:report.decision==='pass'?'resolved':'open',evidence:'Synthetic current-candidate evidence for '+e.key}));const response=qualityResponse(report,source);response.id=input.response_id;
  const checks=deterministicQualityChecks(source);if(w.step===4){const sandbox=sandboxQualityChecks(response,source);checks.passed=checks.passed&&sandbox.passed;checks.sandbox=sandbox.sandbox;}
  console.log(JSON.stringify({source_sha256:qualityAttachment(source).hash,request:qualityReviewRequest(source,w.step===4?'file-fixture':undefined,w.review_context),review:report,response,checks}));
 }else if(input.mode==='repair'){
  const candidate=structuredClone(w.candidate);if(w.step===2)candidate.breakdown.sections.access[0].description+=' Reviewed.';else if(w.step===3)candidate.experiments[0].title+=' Reviewed.';else candidate.setup.notes+=' Reviewed.';
  const response={id:input.response_id,status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(candidate)}]}]};
  console.log(JSON.stringify({source_sha256:qualityAttachment(source).hash,request:qualityRepairRequest(source,w.original_request,w.review,w.checks,w.review_context),candidate,response,checks:deterministicQualityChecks({...source,candidate})}));
 }else throw Error('Unknown fixed fixture operation');
}
