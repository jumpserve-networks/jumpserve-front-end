// Human-authored, exposed development cases. No private answer key is used.
import {validatePaperBreakdown} from '../../lib/research-paper-breakdown.ts';
import {validateExperimentPlan} from '../../lib/paper-experiment-plan.ts';
import {sha256} from '../../lib/paper-intake-model.ts';

export const SYNTHETIC_PAPERS=[
 {id:'SNC-NEG-001',file:'SNC-NEG-001_recreated_paper.pdf'},
 {id:'SNC-MIX-002',file:'SNC-MIX-002_router_buffers.pdf'},
];
export const BENCHMARK_VERSION='synthetic-paper-models-v1';
const normal=v=>String(v).normalize('NFKC').replace(/\s+/gu,' ').toLowerCase();
const includes=(value,...terms)=>terms.some(term=>normal(value).includes(normal(term)));

export function reviewedSyntheticCase(id,paper){
 const mix=id==='SNC-MIX-002';
 const quote=(page,start,end)=>{const text=paper.pages[page-1].text;const a=text.indexOf(start),b=end?text.indexOf(end,a):-1;if(a<0||end&&b<0)throw new Error('Reviewed source passage not found: '+start);const value=text.slice(a,end?b+end.length:a+start.length);if(value.length>800)throw new Error('Reviewed quote exceeds bound.');return{page,quote:value};};
 const item=(section,index,description,citations,extra={})=>({id:section+'-'+index,description,quote:citations[0].quote,page:citations[0].page,citations,kind:'requirement',label:null,criterion:null,specification:null,depends_on:[],...extra});
 const provenance=mix?quote(1,'Provenance notice.','venue, or DOI.'):quote(5,'This document is part of benchmark','for real-world deployment.');
 const topology=mix?quote(2,'Topology Sender','two virtual Ethernet links'):quote(2,'A TCP sender','without synthetic loss.');
 const trial=mix?quote(2,'Trial structure','all four Q values'):quote(2,'For each loss condition','system-load measurements recorded.');
 const claim=(i,label,description,citation,metric,comparison,target,acceptance,tolerance)=>item('validate',i,description,[citation],{kind:'claim',label,criterion:{metric,comparison,target,acceptance,tolerance}});
 const sections={access:[],experiment:[],data:[],validate:[]};
 sections.access=[item('access',1,mix?'Use three isolated Linux namespaces with sender, forwarding router and receiver joined by two virtual Ethernet links.':'Use three isolated Linux namespaces: one sender, one forwarding router and one receiver connected by virtual Ethernet interfaces.',[topology])];
 sections.access.push(item('access',2,mix?'Use Linux traffic control TBF with explicit packet-limited FIFO and separate delay-only netem queues.':'Use a single TCP CUBIC stream and iperf3 for transfers; use ICMP echo requests for unloaded RTT.',[mix?quote(2,'The router uses','router\'s forward egress.'):trial]));
 const specification=mix?{
 setup:'Use three namespaces and two veth pairs, with 10 Mb/s TBF and fixed 16 KiB burst plus one tail-drop pfifo child at router forward egress. Put 10 ms delay-only netem with 10,000-packet limits at S and D egress; return path has no rate restriction.',
 conditions:'Sweep FIFO Q=25,50,100,250 packets, using 12 Mb/s UDP application payload and 1,200-byte payloads. Share the forward FIFO with 56-byte ICMP probes at 20 probes/s; configure no jitter or random loss.',
 procedure:'Use 10 randomized complete blocks containing all four Q values: 40 trials. Drain and reset before each trial, measure unloaded for 10 s, warm up load for 10 s, observe for 30 s, and allow 2 s for late replies.',
 comparisons:'Compare median-across-trial loaded medians via D(250)/D(25)<=0.50, unloaded-median cross-condition range<=2 ms, and receiver UDP payload G(250)/G(25) in [0.95,1.05]. Use paired complete-block bootstrap intervals.',
 }:{
 setup:'Use one long-lived TCP CUBIC stream through three Linux namespaces. Shape forwarding links at 100 Mb/s, insert 20 ms delay per direction, and apply independent random drops only to forward data at router egress; retain reverse rate and delay without artificial loss.',
 conditions:'Use loss levels 0%,1%,2%,5%,10%, three 30-second trials per condition: 15 trials. The minimum 0% versus 5% comparison is a subset of this acquisition, not a separate experiment.',
 procedure:'Confirm reachability and unloaded ICMP RTT, then run iperf3 and record receiver goodput, retransmissions, load and versions. Randomize or interleave conditions. Average receiver-side trial goodputs arithmetically.',
 comparisons:'Compute 100*(G5-G0)/G0 as relative percent change, test strict increase across the full loss grid, and assess unloaded RTT near 40 ms. Agreement tolerances for approximate targets are not specified.',
 };
 sections.experiment=[item('experiment',1,mix?'One randomized-block UDP overload experiment varies FIFO packet capacity while preserving workload, path, shaper rate and burst.':'One single-flow CUBIC loss sweep includes the headline comparison, full-grid trend and unloaded-RTT check.',[topology,trial],{kind:'experiment_specification',specification})];
 if(mix){
  sections.data=[
   item('data',1,'Retain full per-probe records, transmitted requests, successful RTTs and delivery denominator. Require at least 100 successful loaded replies; mark insufficient trials without imputing latency.',[quote(4,'For each trial,','verify the latency result.')]),
   item('data',2,'Collect qdisc statistics at least twice per second, including active FIFO limit, backlog and drops; retain receiver payload over the same steady-state interval and achieved offered rate.',[quote(4,'Capture qdisc statistics','tool versions.')]),
   item('data',3,'The paper reports fabricated loaded medians 48.4 and 23.6 ms and delivered goodputs 9.60 and 9.62 Mb/s at Q=25 and Q=250. Preserve these as source-reported values, separate from measurements.',[quote(3,'25 20.2','83.0'),quote(3,'Table 1. Fabricated values.','potentially valid claims.')],{kind:'reported_result'}),
  ];
  sections.validate=[
   claim(1,'C1','Evaluate loaded latency independently using the ratio of median-across-trial loaded median RTTs at Q=250 versus Q=25.',quote(3,'C1 - Loaded latency.','51.2%.'),'Median across trials of loaded median probe RTT','D(250) / D(25)','Ratio <= 0.50','paper_defined','D(250)/D(25) <= 0.50; interval entirely <=0.50 supports, entirely >0.50 contradicts; overlap inconclusive.'),
   claim(2,'C2','Evaluate unloaded latency independently on drained idle queues across all four Q settings.',quote(3,'C2 - Unloaded latency.','loaded measurements.'),'Range of median-across-trial unloaded median RTT','Maximum minus minimum over Q=25,50,100,250','Range <= 2 ms','paper_defined','At most 2 ms; interval must be fully inside tolerance to support equivalence.'),
   claim(3,'C3','Evaluate delivered UDP payload throughput independently as median receiver goodput ratio at Q=250 versus Q=25.',quote(3,'C3 - Delivered throughput.','full line-rate utilization.'),'Median receiver UDP payload goodput','G(250) / G(25)','0.95 <= ratio <= 1.05','paper_defined','Within 5% relative to Q=25; interval fully inside [0.95,1.05] supports equivalence.'),
   item('validate',4,'Use complete randomized blocks as independent paired bootstrap resampling units. Preserve claim-specific intervals and inconclusive boundary overlaps; pooled probe packets are not independent replications.',[quote(4,'Use complete blocks','an actual experiment.')]),
   item('validate',5,'Check persistent overload, shared forward FIFO, no priority, packet sizes, offloads and absence of extra bottlenecks. Evaluate p95 descriptively, without inventing a fourth pass/fail claim.',[quote(4,'Capture qdisc statistics','judging the claims.'),quote(5,'The lower reported p95','pass/fail target.')]),
  ];
 }else{
  sections.data=[
   item('data',1,'Record receiver goodput in decimal Mb/s, unloaded RTT in ms, retransmissions and system load. Retain raw iperf3 JSON, interface/flow counters, versions and exact qdisc configuration.',[trial,quote(4,'In addition, interface statistics','the conclusion.')]),
   item('data',2,'The paper reports fabricated condition means 72.0,79.0,85.0,97.2,99.0 Mb/s; 97.2 versus 72.0 implies a relative 35.0% increase. Keep source-reported results separate from measurements.',[quote(3,'Successive condition means','increasing series.'),quote(3,'At 5% loss,','35.0%.')],{kind:'reported_result'}),
   item('data',3,'Compute mean receiver-side throughput from three whole trials per condition and compute relative change as 100*(G5-G0)/G0, not percentage points or fraction of capacity.',[quote(2,'The headline effect size','link capacity.')]),
  ];
  sections.validate=[
   claim(1,'H1','Assess whether forward 5% loss produces approximately 35% more mean receiver goodput than 0% loss; the paper supplies no numerical agreement tolerance.',quote(1,'H1.','0% condition.'),'Relative change in mean receiver goodput','100*(G5-G0)/G0, 5% versus 0% loss','Approximately 35% increase','needs_definition',null),
   claim(2,'H2','Assess strict ordering of arithmetic mean receiver goodput at every adjacent condition in the full five-level loss grid.',quote(1,'H2.','mean\ngoodput.'),'Condition arithmetic mean receiver goodput','G0 < G1 < G2 < G5 < G10','Each successive mean strictly increases','paper_defined','Strictly greater at every adjacent tested level.'),
   claim(3,'H3','Assess unloaded RTT near 40 ms with no bulk transfer; the paper supplies no numerical agreement tolerance.',quote(1,'H3.','40 ms.'),'Unloaded ICMP RTT','No bulk transfer versus configured 40 ms','Near 40 ms','needs_definition',null),
   item('validate',4,'Report variance or confidence intervals using whole trials as replications and retain small-sample limitations: three trials per condition do not establish reliable uncertainty across machines or kernel versions.',[quote(5,'A convincing answer','result is true.'),quote(4,'Third, three trials','kernel versions.')]),
   item('validate',5,'Audit the source-reported 72% baseline utilization and near-capacity lossy means. Diagnose these only if observed independently; distinguish delivered bytes and retransmissions from nominal bottleneck rate.',[quote(4,'First, the baseline','across machines and kernel versions.')]),
  ];
 }
 const choiceQuote=mix?quote(4,'Use complete blocks','an actual experiment.'):quote(2,'Virtual Ethernet scheduling,','TCP connections.');
 const choices=mix?[
  ['Bootstrap implementation','Select and record confidence level, resample count, RNG seed, quantile convention and incomplete-block policy before observing results.'],
  ['Tool versions and schedule seed','Choose installed tool versions and deterministic randomized-complete-block schedule seed while retaining author-fixed settings.'],
 ]:[
  ['Queue hierarchy, queue limits and burst','The paper fixes path constraints but not a complete qdisc hierarchy, queue limits or burst values; resolve them as implementation choices.'],
  ['MTU, offloads, pacing and socket buffers','Resolve and record these technical parameters explicitly without claiming author-fixed values.'],
  ['Seeds, warm-up and resetting','Choose reproducible schedule/loss RNG seeds, warm-up and independent-trial reset policies without changing finite 30-second measurements.'],
  ['Software versions and uncertainty method','Choose versions, trial-level uncertainty method and recording configuration; preserve original sample count and limitations.'],
 ];
 const breakdown=validatePaperBreakdown({version:'paper-breakdown-v1',status:'ready',source_id:'benchmark-'+id,text_artifact_id:'benchmark-text-'+id,text_sha256:sha256(JSON.stringify(paper)),policy_sha256:sha256(BENCHMARK_VERSION),extraction_version:'paper-intake-one-pass-v1',cursor:1,total_chunks:1,total_pages:paper.totalPages,missing_text_pages:[],limitation:'Hand-reviewed benchmark input from the synthetic PDF; not an assessment confirmation or measurement.',reason:null,sections,provenance:{classification:'synthetic',statement:'Synthetic manuscript with explicitly fabricated results, not actual measurements.',citations:[provenance]},implementation_choices:choices.map(([name,reason])=>({name,reason,citations:[choiceQuote]})),reported_values_origin:'paper_reported'});
 // These reviewed context plans are identical for all command-model candidates.
 const action=(title,instructions,source_refs,basis='paper',validation_ref=null)=>({title,instructions,source_refs,basis,validation_ref});
 const plan=validateExperimentPlan({experiments:[{title:mix?'FIFO capacity under fixed UDP overload':'Single-flow CUBIC forward-loss sweep',experiment_refs:['experiment-1'],open_questions:mix?[]:['Before observing results, freeze the numerical agreement tolerance for H1 around 35% and H3 near 40 ms. Those claim verdicts remain blocked until defined.'],stages:[
  {title:'Prepare resources',steps:[
   action('Retain provenance','Preserve the synthetic/fabricated disclosure and keep all source-reported values separate from independently measured results.',['data-2']),
   action('Install measurement tools','Install iproute2, iperf3, iputils-ping, ethtool and python3 on Ubuntu/Debian. Record actual versions and permissions.',['access-1','access-2'],'proposed'),
   action('Create isolated topology','Create owned sender/router/receiver network namespaces and two veth pairs. Record namespace names, interface addresses, routes and exact ownership in the action manifest.',['access-1','experiment-1']),
  ]},
  {title:'Configure and calibrate',steps:[
   action('Configure bottleneck',mix?'Configure router forward TBF rate 10mbit burst 16384 and explicit pfifo child; vary only Q in 25,50,100,250 packets. Return path remains unshaped.':'Configure and verify 100 Mb/s forwarding shaping. Proposed: freeze an explicit TBF/netem hierarchy, burst and queue limits with recorded calibration.',['experiment-1'],mix?'paper':'proposed'),
   action('Configure propagation',mix?'Set sender and receiver egress delay-only netem to 10 ms, limit 10000, with no jitter/random loss; verify propagation queues never drop.':'Set 20 ms per direction and apply independent random loss only at router forward data egress. Keep reverse shaping/delay without synthetic loss.',['experiment-1']),
   action('Verify path and versions','Record actual qdisc hierarchy, interfaces, offloads, software versions, unloaded RTT, connectivity, CPU load and calibration. Refuse extra bottlenecks or conflicting ownership.',['experiment-1','validate-5']),
  ]},
  {title:'Collect trials',steps:[
   action('Generate trial schedule',mix?'Create 10 randomized complete blocks with Q=25,50,100,250 once per block: 40 trials. Proposed: freeze schedule RNG seed 20261117.':'Create 15 trials: 3 per loss level 0,1,2,5,10%. Proposed: randomize with schedule seed 20261117; assign distinct recorded loss seeds for each trial.',['experiment-1'],'proposed'),
   action('Reset and verify each trial','Stop only owned traffic, drain queues, apply the scheduled condition and capture configuration checks. Preserve original trial IDs, earlier artifacts and invalid-trial reasons.',['experiment-1','validate-5']),
   action('Collect authoritative trial measurements',mix?'For each scheduled trial perform a 10 s unloaded check, then fixed 12 Mb/s UDP payload with 1200-byte datagrams, 10 s warm-up and 30 s observation. Probe with 56-byte ICMP payload at 20/s through the shared FIFO; keep requests sent in the observation window and allow 2 s late replies. Capture queue stats >=2 Hz and receiver payload bytes over the identical interval, actual offered rate, CPU load and raw probe IDs. Mark <100 successful loaded replies insufficient; retain delivery denominator and never impute zero RTT.':'For each scheduled trial record unloaded ICMP RTT, then one 30-second TCP CUBIC iperf3 stream. Proposed: zero warm-up, distinct recorded loss seeds and fresh owned transfer processes. Save raw receiver-authoritative iperf3 JSON, actual bytes/time, retransmissions, flow/interface counters, load and condition metadata. Do not reuse reported benchmark numbers.',['experiment-1','data-1']),
  ]},
  {title:'Analyze measurements',steps:[
   action('Compute trial and condition statistics',mix?'Discover and verify earlier manifests and raw formats. Compute each trial unloaded median, successful loaded median/p95, payload decimal Mb/s and successful/transmitted probe ratio; exclude insufficient trials explicitly. Aggregate as medians across trial statistics per Q. Preserve blocks; compute D250/D25, max-minus-min unloaded condition medians, and G250/G25. Keep p95 descriptive.':'Discover and verify earlier manifests and raw formats. Compute arithmetic mean receiver goodput per loss condition from the three whole trials, preserve zero versus missing, and calculate 100*(G5-G0)/G0 plus strict adjacent full-grid ordering. Keep reported values separate.',['data-1','data-2','data-3','validate-1','validate-2','validate-3']),
   action('Estimate uncertainty',mix?'Use paired complete blocks as resampling units. Proposed: 95% percentile bootstrap with 10000 resamples and RNG seed 20261118; retain complete-block coverage and exclude incomplete blocks explicitly. Recompute all aggregate statistics each resample.':'Use whole trials as independent units. Proposed: report per-condition sample standard deviation and descriptive-only inference for n=3; do not treat interval samples as replications or imply pairing.',['validate-4'],'proposed'),
   action('Persist measurements','Preserve immutable raw artifacts and normalized measurements with study/configuration/run/trial IDs, provenance, versions, timestamps, seeds and invalid reasons in Supabase. Credentials and ingestion integration must be provided securely; do not invent successful uploads.',['data-1'],'proposed'),
  ]},
  {title:'Evaluate claims independently',steps:sections.validate.filter(i=>i.kind==='claim').map((c,i)=>action('Evaluate '+c.label,`${c.description} Statistic: ${c.criterion.comparison}. Rule: ${c.criterion.tolerance??'Undefined; freeze before observing results and withhold this verdict.'} ${mix?'Use the paired-block interval; boundary overlap is inconclusive.':''}`,['validate-'+(i+1),'experiment-1'],'paper','validate-'+(i+1)))},
 ]}]},breakdown);
 return{id,paper,breakdown,plan,command_refs:['1.3.3','1.4.1']};
}

export function syntheticQualityChecks(task,value,testCase){
 const mix=testCase.id==='SNC-MIX-002',checks=[],add=(name,pass)=>checks.push({name,passed:Boolean(pass)});
 const text=normal(JSON.stringify(value));
 if(task==='breakdown'){
  add('synthetic/fabricated provenance retained',value.provenance?.classification==='synthetic'&&includes(value.provenance?.statement,'fabricat','invent'));
  add('one consolidated experiment',value.sections?.experiment?.length===1);
  add('no invented bibliographic authors',value.authors?.length===0);
  const claims=value.sections?.validate?.filter(i=>i.kind==='claim')??[];
  add('exactly three distinct claims',claims.length===3);
  for(const [i,label]of(mix?['C1','C2','C3']:['H1','H2','H3']).entries()){
   const claim=claims.find(c=>new RegExp('\\b'+label+'\\b','i').test(c.label??''));
   add(label+' acceptance status preserved',claim?.criterion?.acceptance===(mix||i===1?'paper_defined':'needs_definition')&&(!(mix||i===1)?claim?.criterion?.tolerance===null:true));
  }
  add('reported values explicitly attributed',(value.sections?.data?.filter(i=>i.kind==='reported_result')??[]).length>0&&(value.sections?.data?.filter(i=>i.kind==='reported_result')??[]).every(i=>i.description.startsWith('The paper reports ')));
  const evidence=(value.sections?.experiment??[]).map(i=>JSON.stringify(i)).join(' ');
  add('correct trial design retained',mix?includes(evidence,'block')&&includes(evidence,'10')&&includes(evidence,'25')&&includes(evidence,'250'):includes(evidence,'30')&&includes(evidence,'three','3')&&includes(evidence,'10%','10 %'));
  add('correct impairment placement retained',mix?includes(evidence,'16 kib','16384','16,384')&&includes(evidence,'10,000','10000'):includes(evidence,'forward')&&includes(evidence,'reverse','acknowledg'));
 }else if(task==='plan'){
  const steps=value.experiments?.flatMap(e=>e.stages?.flatMap(s=>s.steps)??e.steps??[])??[];
  add('hierarchical actionable plan',value.experiments?.length===1&&value.experiments[0].stages?.length>=4&&steps.length>=15);
  add('synthetic provenance and independent measurements separated',includes(text,'synthetic','fabricat')&&includes(text,'independent')&&includes(text,'separat'));
  add('full trial count explicit',mix?/\b40\s+(?:total\s+)?trials?/.test(text):/\b15\s+(?:total\s+)?trials?/.test(text));
  for(let i=1;i<=3;i++)add('one dedicated validation for claim '+i,steps.filter(s=>s.validation_ref==='validate-'+i).length===1);
  add('replication unit explicit',mix?includes(text,'complete block','whole block','block-level','block bootstrap'):includes(text,'whole trial','trial-level','independent trial'));
  add('uncertainty method named',includes(text,'bootstrap','standard deviation','sample variance'));
  add('measurement provenance persisted',includes(text,'supabase')&&includes(text,'raw')&&includes(text,'invalid','exclu'));
  const questions=normal(value.experiments?.flatMap(e=>e.open_questions??[]).join(' '));
  add('scientific acceptance handled correctly',mix?!includes(questions,'define c1','define c2','define c3','missing acceptance'):includes(questions,'before observing results')&&includes(questions,'h1')&&includes(questions,'h3'));
  add('correct observation and scope',mix?includes(text,'12 mb','12mb','12 mbit','12mbit')&&includes(text,'1,200','1200')&&includes(text,'100 successful'):includes(text,'30-second','30 second','30 s','30s')&&includes(text,'cubic')&&includes(text,'forward'));
 }else{
  const ref=task==='commands-collect'?'1.3.3':'1.4.1';const block=value.actions?.[ref];const commands=normal(block?.commands??'');
  add('selected action has executable commands',block?.kind==='terminal'&&commands.length>0);
  add('no shared script dependency',!/(?:source|bash|python3?)\s+[^\n]*\/steps\/[^\s]+\.(?:sh|py)\b/.test(commands));
  add('data contract recorded or inspected',includes(commands,'step-manifest-v1')&&includes(commands,'manifest.json'));
  add('no fabricated benchmark data copied as observations',!['97.2','72.0','48.4','23.6','9.60','9.62'].some(n=>new RegExp('(?<![0-9.])'+n.replace('.','\\.')+'(?![0-9.])').test(commands)));
  if(task==='commands-collect'){
   add('real instrumentation present',mix?includes(commands,'ping','icmp')&&includes(commands,'iperf3','udp'):includes(commands,'iperf3')&&includes(commands,'ping','icmp'));
   add('scope parameters present',mix?includes(commands,'1200','1_200')&&includes(commands,'12m','12000000','12_000_000')&&includes(commands,'0.05','20'):includes(commands,'cubic')&&includes(commands,'30'));
   add('timing or window handling implemented',includes(commands,'monotonic','timestamp','time.time','start_time','interval'));
   add('raw records retained',includes(commands,'json','jsonl','csv')&&includes(commands,'write','dump','tee','open('));
  }else{
   add('trial/condition grouping implemented',includes(commands,'trial','block')&&includes(commands,mix?'queue':'loss','condition'));
   add('correct aggregation function present',mix?includes(commands,'median'):includes(commands,'mean','sum('));
   add('missing/invalid handling present',includes(commands,'invalid','missing','insufficient','isfinite'));
   add('claim comparisons implemented',mix?includes(commands,'ratio',' / ','/')&&includes(commands,'range','max('):includes(commands,'100')&&includes(commands,'monotonic','strict','adjacent','zip('));
  }
 }
 return checks;
}
