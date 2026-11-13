import {hierarchicalImplementationPlan,implementationBreakdown} from './implementation-plan-fixture.mjs';
import {evidencePlan} from './paper-evidence-fixture.mjs';

export const hierarchyBreakdown = implementationBreakdown;
export function maximumHierarchyPlan() {
 const plan=hierarchicalImplementationPlan(),experiment=plan.experiments[0];
 const action=experiment.stages[0].steps[0],claims=experiment.stages.at(-1).steps;
 experiment.stages=[
  {title:'Setup actions',steps:Array.from({length:8},()=>structuredClone(action))},
  {title:'Collection actions',steps:Array.from({length:8},()=>structuredClone(action))},
  {title:'Analysis and claim actions',steps:[...Array.from({length:5},()=>structuredClone(action)),...claims]},
 ];return plan;
}
export function hierarchyPlanCases() {
 const cases=[{name:'legacy flat claim checks',valid:true,plan:evidencePlan()},{name:'stages and actions',valid:true,plan:hierarchicalImplementationPlan()},{name:'24 actions preserve distinct claims',valid:true,plan:maximumHierarchyPlan()}];
 const bad=(name,mutate,base=hierarchicalImplementationPlan)=>{const plan=base();mutate(plan.experiments[0],plan);cases.push({name,valid:false,plan});};
 bad('empty stages',e=>e.stages=[]);
 bad('empty stage actions',e=>e.stages[0].steps=[]);
 bad('blank stage title',e=>e.stages[0].title=' ');
 bad('oversized stage title',e=>e.stages[0].title='x'.repeat(161));
 bad('unknown stage field',e=>e.stages[0].status='done');
 bad('mixed experiment layouts',e=>e.steps=e.stages[0].steps);
 bad('deeper action nesting',e=>e.stages[0].steps[0].steps=[]);
 bad('unknown action source',e=>e.stages[0].steps[0].source_refs=['access-99']);
 bad('null action source',e=>e.stages[0].steps[0].source_refs.push(null));
 bad('missing validation identity',e=>delete e.stages[0].steps[0].validation_ref);
 bad('oversized action instructions',e=>e.stages[0].steps[0].instructions='x'.repeat(801));
 bad('missing claim across stages',e=>e.stages.at(-1).steps.pop());
 bad('duplicate claim across stages',e=>e.stages[0].steps.push(structuredClone(e.stages.at(-1).steps[0])));
 bad('unlinked claim source',e=>e.stages.at(-1).steps[0].source_refs=['experiment-1']);
 bad('nine stages',e=>{const first=e.stages[0],last=e.stages.at(-1);e.stages=[...Array.from({length:8},()=>structuredClone(first)),last];});
 bad('nine actions in a stage',e=>{const a=e.stages[0].steps[0];e.stages[0].steps=Array.from({length:9},()=>structuredClone(a));});
 bad('25 total actions',e=>e.stages.push({title:'One extra action',steps:[structuredClone(e.stages[0].steps[0])]}),maximumHierarchyPlan);
 return cases;
}
