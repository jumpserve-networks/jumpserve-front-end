import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {planQualityChecks,validatePlanExpectations} from '../scripts/lib/experiment-plan-checks.mjs';
import {implementationBreakdown,implementationPlan,implementationExpectations,hierarchicalImplementationPlan} from './support/implementation-plan-fixture.mjs';
import {evidencePlan} from './support/paper-evidence-fixture.mjs';
import {planningSources,validateExperimentPlan} from '../lib/paper-experiment-plan.ts';
import {experimentPlanRequest} from '../lib/paper-experiment-plan-model.ts';
import {breakdownFixture} from './support/experiment-plan-fixture.mjs';
import {sha256} from '../lib/paper-intake-model.ts';
import {privateDirectory,privateJSON} from '../scripts/lib/paper-evaluation-store.mjs';

test('provider schemas admit only confirmed references and reserve implementation space without changing legacy saved plans',()=>{
 const breakdown=implementationBreakdown(),request=experimentPlanRequest(breakdown),experiment=request.text.format.schema.properties.experiments.items;
 assert.deepEqual(experiment.properties.experiment_refs.items.enum,['experiment-1']);
 const actions=experiment.properties.stages.items.properties.steps;
 assert.deepEqual(actions.items.properties.source_refs.items.enum,Object.values(planningSources(breakdown)).flat().map(source=>source.ref));
 assert.equal(actions.items.properties.source_refs.items.enum.includes('provenance'),false);
 assert.equal(experiment.properties.steps,undefined);assert.equal(experiment.properties.stages.maxItems,8);assert.equal(actions.maxItems,8);
 const legacy=experimentPlanRequest(breakdownFixture());assert.equal(legacy.text.format.name,'paper_experiment_steps_v3');assert.deepEqual(legacy.text.format.schema.properties.experiments.items.properties.stages.items.properties.steps.items.properties.validation_ref.enum,[null]);
 // Historical validation-only outputs remain readable; the stronger generation
 // contract does not invalidate an owner's already saved plan.
 assert.doesNotThrow(()=>validateExperimentPlan(evidencePlan(),breakdown));
});
test('content expectations recognize complete source-bound scope configuration measurement and analysis',()=>{
 const plan=validateExperimentPlan(implementationPlan(),implementationBreakdown());
 const checks=planQualityChecks(plan,implementationExpectations());assert.ok(checks.length>10);assert.deepEqual(checks.filter(check=>!check.passed),[]);
 assert.deepEqual(planQualityChecks(plan,undefined),[]);
});
test('a structurally valid validation-only plan fails implementation content checks',()=>{
 const plan=validateExperimentPlan(evidencePlan(),implementationBreakdown());
 const failures=planQualityChecks(plan,implementationExpectations()).filter(check=>!check.passed).map(check=>check.name);
 for(const name of ['implementation steps retained','full-grid trial scope','proposed queue and burst configuration','independent measurement persistence','trial-level uncertainty'])assert.ok(failures.includes(name),name);
});
test('a minimum subset cannot satisfy the exposed full-grid expectation and implementation proposals keep their basis',()=>{
 const plan=implementationPlan();plan.experiments[0].steps[0].instructions='Only test 0% and 3%, with four trials total.';plan.experiments[0].steps[1].basis='paper';
 const checks=planQualityChecks(plan,implementationExpectations());
 assert.equal(checks.find(check=>check.name==='full-grid trial scope').passed,false);assert.equal(checks.find(check=>check.name==='independent measurement persistence').passed,false);
});
test('question checks use unresolved questions rather than a matching phrase elsewhere in the plan',()=>{
 const plan=implementationPlan();plan.experiments[0].open_questions=[];
 assert.equal(planQualityChecks(plan,implementationExpectations()).find(check=>check.name==='unresolved scientific acceptance').passed,false);
 const expected={forbidden:['Already validated'],details:[{name:'normalized content',scope:'plan',mentions:[['RAW   JSON']]}]};
 assert.ok(planQualityChecks(plan,expected).every(check=>check.passed));plan.experiments[0].title='Already validated';assert.equal(planQualityChecks(plan,expected).at(-1).passed,false);
});
test('expectation files are bounded data with no executable graders or invalid source identities',()=>{
 for(const bad of [{},{code:'process.exit(0)'},{experiment_count:9},{minimum_steps:193},{minimum_stages:65},{required_source_refs:['data-99']},{required_source_refs:['data-1','data-1']},{details:[{name:'Bad',scope:'open_questions',basis:'paper',mentions:[['x']]}]},{details:[{name:'Bad',mentions:[[]]}]},{details:[{name:'Bad',mentions:[['x'.repeat(161)]]}]},{details:[{name:'Bad',scope:'javascript',mentions:[['x']]}]},{forbidden:['']},null])assert.throws(()=>validatePlanExpectations(bad),/bounded/);
 assert.equal(validatePlanExpectations(implementationExpectations()).experiment_count,1);
});
test('frozen browser-free replay checks content, fails deficient plans, and detects changed expectations',async()=>{
 const breakdown=implementationBreakdown(),request=experimentPlanRequest(breakdown),expectations=implementationExpectations();
 assert.equal(request.model,'gpt-5.4-mini-2026-03-17');assert.equal(request.text.format.name,'paper_experiment_steps_v3');assert.equal(JSON.stringify(request).includes('full-grid trial scope'),false);
 const directory=join(process.cwd(),'.test-artifacts','experiment-plan-evaluations','unit-content-'+randomUUID());await privateDirectory(directory);
 const saved={breakdown,request,expectations,identity:sha256(JSON.stringify({breakdown,request,expectations})),response:{id:'resp_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(hierarchicalImplementationPlan())}]}]}};
 const args=['--import','./scripts/lib/register-typescript.mjs','scripts/evaluate-experiment-plan.mjs','--replay',directory.split('/').at(-1)];
 await privateJSON(join(directory,'run.json'),saved);let result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).model_calls,0);assert.ok(JSON.parse(result.stdout).checks.every(check=>check.passed));
 const {steps,...deficient}=evidencePlan().experiments[0];saved.response.output[0].content[0].text=JSON.stringify({experiments:[{...deficient,stages:[{title:'Only validation',steps}]}]});await privateJSON(join(directory,'run.json'),saved);result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000});assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).passed,false);
 saved.expectations.minimum_steps=1;await privateJSON(join(directory,'run.json'),saved);result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000});assert.equal(result.status,1);assert.match(result.stderr,/frozen identity/);
});
