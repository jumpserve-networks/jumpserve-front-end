// Invented software expectations. These are not measurements or a paper corpus.
import {evidenceBreakdown} from './paper-evidence-fixture.mjs';
export const implementationBreakdown = evidenceBreakdown;
export function implementationPlan() {
  return {experiments:[{title:'Complete loss sweep with a shared setup',experiment_refs:['experiment-1'],steps:[
    {title:'Freeze scope and proposed configuration',basis:'proposed',validation_ref:null,source_refs:['access-1','experiment-1'],instructions:'Proposed implementation: use the two Linux hosts on the specified 50 Mb/s path with 10 ms delay each direction. Include 0%, 3%, and 6% loss, with two 20-second trials at each setting: six trials total. Select and record a FIFO queue limit of 100 packets and a 16 KiB shaper burst as proposed settings, with calibration before use.'},
    {title:'Calibrate and collect independent measurements',basis:'proposed',validation_ref:null,source_refs:['experiment-1','data-1'],instructions:'Proposed instrumentation: verify rate, idle RTT and configured loss before collecting receiver goodput, retransmissions and raw JSON per trial. Randomize the recorded schedule. Persist configuration, run and trial IDs, condition, timestamps, software versions, seed, actual duration and artifacts in Supabase. Keep fabricated paper values separate from independent measurements; record failed trials and missing values explicitly.'},
    {title:'Analyze whole trials',basis:'proposed',validation_ref:null,source_refs:['experiment-1'],instructions:'Proposed analysis: use the independently executed whole trial as the replication unit, compute arithmetic condition means and variance, and state the assumptions and limitations of confidence intervals at two trials per setting. Do not infer pairing from row order. Freeze the analysis and exclusion rules before observing results.'},
    {title:'Evaluate H1',basis:'paper',validation_ref:'validate-1',source_refs:['experiment-1','validate-1'],instructions:'Compute 100*(G3-G0)/G0 from independent means and report the direction and magnitude against the about-20% claim. Numerical agreement remains unresolved until its missing tolerance is defined.'},
    {title:'Evaluate H2',basis:'paper',validation_ref:'validate-2',source_refs:['experiment-1','validate-2'],instructions:'Check the observed strict ordering G0 < G3 < G6 across the full grid. Report sample-mean ordering separately from population evidence.'},
    {title:'Evaluate H3',basis:'paper',validation_ref:'validate-3',source_refs:['experiment-1','validate-3'],instructions:'Compare measured idle RTT with the near-20 ms target. Report measurements and leave numerical agreement unresolved until its missing tolerance is defined.'},
  ],open_questions:['Define and freeze H1 and H3 tolerance rules before observing results; their numerical agreement verdicts remain unresolved.']} ]};
}
export function implementationExpectations() {
  return {experiment_count:1,minimum_steps:6,required_source_refs:['access-1','experiment-1','data-1','validate-1','validate-2','validate-3'],details:[
    {name:'full-grid trial scope',mentions:[['0%'],['3%'],['6%'],['six trials','6 trials'],['20-second','20 second']]},
    {name:'proposed queue and burst configuration',basis:'proposed',source_refs:['experiment-1'],mentions:[['queue'],['burst'],['proposed']]},
    {name:'independent measurement persistence',basis:'proposed',mentions:[['receiver'],['raw json'],['supabase'],['trial'],['seed']]},
    {name:'trial-level uncertainty',mentions:[['replication unit'],['variance','confidence interval'],['assumptions','limitations']]},
    {name:'data provenance separation',scope:'plan',mentions:[['fabricated','synthetic'],['independent measurements'],['separate']]},
    {name:'unresolved scientific acceptance',scope:'open_questions',mentions:[['h1'],['h3'],['tolerance'],['before observing','before inspecting']]},
  ]};
}
