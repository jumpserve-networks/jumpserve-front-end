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
export function hierarchicalImplementationPlan() {
 const {steps,...experiment}=implementationPlan().experiments[0];
 return {experiments:[{...experiment,stages:[
  {title:'Prepare and configure the experiment',steps:[steps[0]]},
  {title:'Collect independent measurements',steps:[steps[1]]},
  {title:'Analyze measurements',steps:[steps[2]]},
  {title:'Validate the three claims',steps:steps.slice(3)},
 ]}]};
}

export function granularImplementationPlan(){
 const action=(title,instructions,source_refs=['experiment-1'],basis='proposed')=>({title,instructions,basis,source_refs,validation_ref:null});
 return {experiments:[{title:'Reproduce the complete loss sweep',experiment_refs:['experiment-1'],stages:[
  {title:'Prepare the environment',steps:[
   action('Freeze the experiment scope','Freeze 0%, 3% and 6% loss with two 20-second trials per condition: six trials total. Keep fabricated paper values separate from independent measurements in the scope record.',['experiment-1','data-1']),
   action('Install measurement tools','Proposed: install iperf3 and JSON tooling on the two Linux hosts. Save the installation log and verify executable availability.',['access-1','experiment-1']),
   action('Capture software versions','Proposed: record the kernel, iperf3 and traffic-control versions in an immutable environment manifest.',['access-1','experiment-1']),
   action('Allocate measurement identities','Proposed: allocate Supabase configuration, run and trial identities for the six planned trials. Save their mapping before collection.',['experiment-1','data-1']),
  ]},
  {title:'Configure the path',steps:[
   action('Create the host topology','Proposed: connect two isolated Linux hosts through the controlled path. Save the interface and namespace mapping.',['access-1','experiment-1']),
   action('Configure the rate shaper','Configure the specified 50 Mb/s path. Record the exact qdisc hierarchy and the resolved traffic-control configuration.',['experiment-1'],'paper'),
   action('Configure propagation delay','Configure 10 ms propagation delay in each direction. Save the resolved delay settings.',['experiment-1'],'paper'),
   action('Select the queue limit','Proposed: use a queue limit of 100 packets as a fixed baseline. Verify the resolved queue setting and retain backlog/drop diagnostics.'),
   action('Select the shaper burst','Proposed: use a 16 KiB shaper burst as a fixed baseline. Verify the resolved burst value before calibration.'),
  ]},
  {title:'Calibrate the path',steps:[
   action('Check connectivity','Proposed: verify bidirectional reachability between the hosts. Save the connectivity check output.'),
   action('Measure the calibrated rate','Proposed: measure the no-loss path rate against the configured 50 Mb/s target. Save the calibration record without treating it as a claim outcome.'),
   action('Measure idle RTT','Measure idle RTT with no bulk transfer against the near-20 ms target. Retain the raw RTT observations.',['experiment-1','validate-3'],'paper'),
   action('Check configured loss','Proposed: record requested and observed packet-loss counts for each configured loss level. Save the calibration diagnostics separately from trial measurements.'),
  ]},
  {title:'Collect and persist measurements',steps:[
   action('Freeze the trial schedule','Proposed: shuffle the six condition/trial identities with schedule seed 17. Save the complete ordered schedule before execution.'),
   action('Assign independent loss seeds','Proposed: assign distinct loss seeds 1001 through 1006 to schedule positions 1 through 6. Save the trial-to-seed mapping; never restart the same realization for each repetition.'),
   action('Reset each trial','Proposed: reset the connection and impairment state before each trial. Use zero warm-up and save the reset log without shortening the paper-defined 20-second measurement window.'),
   action('Collect receiver measurements','Proposed: collect receiver goodput, retransmissions, idle RTT and raw JSON for each scheduled trial. Retain actual byte counts and timing, including failed-trial diagnostics.',['experiment-1','data-1']),
   action('Upload raw trial artifacts','Proposed: upload each raw JSON artifact with its SHA256, trial identity and original configuration reference. Save the artifact receipt.',['experiment-1','data-1']),
   action('Persist normalized measurements','Proposed: persist receiver goodput and raw JSON artifact references in Supabase with configuration/run/trial IDs, condition, timestamps, versions, seed, duration and failure reason. Preserve zero separately from missing.',['experiment-1','data-1']),
  ]},
  {title:'Analyze independent measurements',steps:[
   action('Compute condition means','Compute arithmetic mean receiver goodput for each loss condition from valid independent whole trials. Save the condition summaries and their sample counts.',['experiment-1'],'paper'),
   action('Report trial-level uncertainty','Use each whole trial as the replication unit. Proposed: report descriptive variance and small-sample limitations at two trials per condition, without claiming calibrated confidence intervals.'),
  ]},
  {title:'Validate the paper claims',steps:implementationPlan().experiments[0].steps.slice(3)},
 ],open_questions:implementationPlan().experiments[0].open_questions}]};
}
export function granularImplementationExpectations(){
 const previous=implementationExpectations();
 // Check the same responsibilities at the finer action granularity. Collection
 // and storage, and the two unresolved claims, need separate content checks.
 return {...previous,minimum_stages:5,minimum_steps:16,max_instruction_characters:400,details:[
  {name:'full-grid trial scope',mentions:[['0%'],['3%'],['6%'],['six trials','6 trials','6-trial'],['20-second','20 second','20 s']]},
  {name:'receiver collection action',mentions:[['receiver'],['raw','json']]},
  {name:'measurement persistence action',mentions:[['supabase'],['configuration','config'],['trial'],['seed']]},
  {name:'trial-level uncertainty calculation',mentions:[['replication unit','unit of analysis','inference unit'],['variance','standard deviation','confidence interval','bootstrap'],['limitations','assumptions','small-sample']]},
  {name:'data provenance separation',scope:'plan',mentions:[['fabricated','synthetic'],['independent measurements','independently measured'],['separate','separately']]},
  ...['h1','h3'].map(claim=>({name:`unresolved ${claim} acceptance`,scope:'open_questions',mentions:[[claim],['tolerance','agreement rule'],['before observing','before inspecting','before reading','before results']]})),
  {name:'explicit proposed queue limit',basis:'proposed',source_refs:['experiment-1'],mentions:[['queue'],['limit'],['packets','bytes','kib']]},
  {name:'explicit proposed burst setting',basis:'proposed',source_refs:['experiment-1'],mentions:[['burst'],['bytes','kib','packets']]},
  {name:'connectivity check',mentions:[['reachability','connectivity']]},
  {name:'idle path calibration',mentions:[['idle'],['rtt']]},
 ]};
}
