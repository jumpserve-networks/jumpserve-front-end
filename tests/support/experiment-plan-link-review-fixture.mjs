import {randomUUID} from 'node:crypto';
import {experimentPlanRequest} from '../../lib/paper-experiment-plan-model.ts';
import {hierarchicalImplementationPlan,implementationBreakdown} from './implementation-plan-fixture.mjs';

export function duplicatedClaimFixture(){
 const breakdown=implementationBreakdown(),plan=hierarchicalImplementationPlan();
 plan.experiments[0].stages[0].steps.push({title:'Measure unloaded RTT',instructions:'Measure unloaded RTT and retain the unmodified measurement record.',basis:'paper',source_refs:['validate-3','experiment-1'],validation_ref:'validate-3'});
 const keep=[{claim_ref:'validate-3',experiment:1,stage:4,step:3}];
 const row={study_id:randomUUID(),owner_id:randomUUID(),revision:3,status:'failed',plan:null,reason:'The experiment steps could not be verified against the confirmed paper sections.',provider_response_id:'resp_duplicate_link_fixture',confirmed_breakdown:breakdown,request:experimentPlanRequest(breakdown),response:{id:'resp_duplicate_link_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(plan)}]}]}};
 return{row,keep,plan};
}
