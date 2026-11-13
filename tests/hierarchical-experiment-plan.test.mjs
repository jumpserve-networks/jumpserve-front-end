import assert from 'node:assert/strict';
import {test} from 'node:test';
import {experimentActions,validateExperimentPlan} from '../lib/paper-experiment-plan.ts';
import {readExperimentPlan} from '../lib/paper-experiment-plan-runner.ts';
import {hierarchyBreakdown,hierarchyPlanCases} from './support/hierarchical-plan-cases.mjs';
import {hierarchicalImplementationPlan} from './support/implementation-plan-fixture.mjs';
import {planQualityChecks} from '../scripts/lib/experiment-plan-checks.mjs';

test('hierarchy guards preserve legacy plans and bound stage/action depth, size and source coverage',()=>{
 for(const item of hierarchyPlanCases()){
  if(item.valid)assert.equal(validateExperimentPlan(item.plan,hierarchyBreakdown()),item.plan,item.name);
  else assert.throws(()=>validateExperimentPlan(item.plan,hierarchyBreakdown()),undefined,item.name);
 }
});
test('hierarchical provider output cannot be replaced by a flat plan and every claim remains linked',()=>{
 const response=plan=>({id:'resp_hierarchy',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(plan)}]}]});
 const plan=hierarchicalImplementationPlan();
 assert.equal(readExperimentPlan(response(plan),hierarchyBreakdown(),'paper_experiment_steps_v3').experiments[0].stages.length,4);
 const flat=hierarchyPlanCases()[0].plan;
 assert.throws(()=>readExperimentPlan(response(flat),hierarchyBreakdown(),'paper_experiment_steps_v3'),/missing its stages/);
 assert.doesNotThrow(()=>readExperimentPlan(response(flat),hierarchyBreakdown(),'paper_experiment_steps_v2'));
 assert.throws(()=>readExperimentPlan(response(plan),hierarchyBreakdown(),'paper_experiment_steps_v2'),/original flat planning format/);
 const actions=experimentActions(plan.experiments[0]);assert.equal(actions.length,6);assert.deepEqual(actions.map(a=>a.validation_ref).filter(Boolean),['validate-1','validate-2','validate-3']);
});
test('content evaluation inspects nested actions and counts stages without treating headings as action evidence',()=>{
 const plan=hierarchicalImplementationPlan(),expectations={minimum_stages:4,minimum_steps:6,details:[{name:'nested measurement persistence',basis:'proposed',mentions:[['receiver'],['supabase']]},{name:'stage labels are narrative',scope:'plan',mentions:[['Analyze measurements']]}]};
 assert.ok(planQualityChecks(plan,expectations).every(c=>c.passed));
 assert.equal(planQualityChecks(plan,{details:[{name:'heading alone is not an action',mentions:[['Analyze measurements']]}]})[0].passed,false);
});
