import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';

globalThis.__computationalReact=React;
const replacements={
 'next/link':"export default function Link(props){return globalThis.__computationalReact.createElement('a',props);}",
 'next/navigation':'export const useRouter=()=>({refresh:()=>globalThis.__studyRefreshes++});',
};
const hooks=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {StudyDashboard}=await import('../app/components/delay-study/dashboard.tsx');
const {GoodputTrace,SensitivityChart}=await import('../app/components/delay-study/charts.tsx');
const {LeoDashboard}=await import('../app/components/leo-study/dashboard.tsx');
const {ReliableDashboard}=await import('../app/components/reliable-study/dashboard.tsx');
hooks.deregister();
beforeEach(()=>{globalThis.__studyRefreshes=0;});afterEach(cleanup);
const click=async target=>act(async()=>{fireEvent.click(typeof target==='string'?screen.getByRole('button',{name:target,exact:true}):target);});
async function choose(label,name){await click(screen.getByRole('combobox',{name:label,exact:true}));await act(async()=>{const option=screen.getByRole('option',{name,exact:true});fireEvent.pointerDown(option,{pointerType:'mouse',button:0});fireEvent.click(option);});}

function delayData(){
 const configurations=['baseline','ack_equalized'].map((treatment,index)=>({id:'configuration-'+index,family:'homogeneous_bbr',cca_group:'bbr/bbr',treatment,capacity_mbps:100,queue_packets:1000,duration_seconds:60,warmup_seconds:10,
  delay_study_config_flows:[{flow_index:2,cca:'bbr',configured_base_rtt_ms:20},{flow_index:1,cca:'bbr',configured_base_rtt_ms:10}],
  delay_study_cells:[{flow_index:1,mean_share:index?null:0,matched_repetitions:index?0:2,mean_goodput_mbps:0,ci_low_mbps:0,ci_high_mbps:1}]}));
 return {campaign:{status:'running',planned_trials:25,bootstrap_replicates:2000},configurations,summaries:[{family:'homogeneous_bbr',cca_group:'bbr/bbr',flow_index:1,cca:'bbr',baseline_delta:1,baseline_ci_low:0,baseline_ci_high:2,treatment_delta:0,treatment_ci_low:0,treatment_ci_high:1,improvement:1,improvement_ci_low:0,improvement_ci_high:2,matched_pairs:2,expected_pairs:5,observed_assignments:1,expected_assignments:2,assessment:'incomplete',unbounded:false}],
  trials:Array.from({length:25},(_,index)=>({id:'trial-'+String(index).padStart(3,'0'),configuration_id:'configuration-'+index%2,block_index:index,replicate:index%5,status:['completed','planned','invalid','failed','unknown'][index%5]})),
  latency:[{worker_index:0,treatment:'ack_delay',received_packets:999,sent_packets:1000,median_forward_ms:0,median_rtt_ms:20,validation_passed:true},{worker_index:1,treatment:'forward_delay',received_packets:0,sent_packets:1000,median_forward_ms:0,median_rtt_ms:0,validation_passed:false}]};
}

test('delay study preserves paired-sample coverage paper values and measured zero heatmap shares',async()=>{
 const data=delayData(),before=structuredClone(data);render(React.createElement(StudyDashboard,{data}));
 assert.ok(screen.getByText(/Provisional estimates/));assert.ok(screen.getByText(/BBRv3 δ 4.90 → 0.38/));
 assert.ok(screen.getByRole('img',{name:/Per-flow delay sensitivity/}));assert.ok(screen.getAllByText('2 / 5').length);
 const zero=screen.getAllByRole('button',{name:'Flow 1 10 ms, flow 2 20 ms: 0.0 percent flow 1 share'})[0];
 await click(zero);assert.ok(screen.getByText('0.00 Mbps'));assert.ok(screen.getAllByText('0.0%').length>=1);
 assert.equal(data.configurations[0].delay_study_config_flows[0].flow_index,2);assert.deepEqual(data,before);
 assert.ok(screen.getByText('Passed'));assert.ok(screen.getByText('Failed'));
 await click('Refresh measurements');assert.equal(globalThis.__studyRefreshes,1);
});

test('delay trial pagination and configuration selection keep exact trial identities and reset pages',async()=>{
 render(React.createElement(StudyDashboard,{data:delayData()}));
 assert.equal(screen.getByRole('button',{name:'Previous'}).disabled,true);await click('Next');assert.equal(screen.getByRole('button',{name:'Next'}).disabled,true);await click('Previous');
 await choose('Configuration','Baseline · 10 / 20 ms');assert.ok(screen.getByText('13 scheduled trials in this selection'));assert.equal(screen.getByRole('button',{name:'Previous'}).disabled,true);
 assert.ok(screen.getAllByRole('link').every(a=>a.getAttribute('href').startsWith('/propagation-delay-study/test-results/trial-')));
 await choose('Configuration','All configurations');assert.ok(screen.getByText('25 scheduled trials in this selection'));
});

test('changing the delay experiment group resets the selected configuration and its trial page',async()=>{
 const data=delayData();data.configurations.push({...structuredClone(data.configurations[0]),id:'common-shift',family:'common_shift',cca_group:'cubic/cubic'});render(React.createElement(StudyDashboard,{data}));await choose('Configuration','Baseline · 10 / 20 ms');await click(screen.getByRole('combobox',{name:'Experiment and algorithms'}));const option=screen.getAllByRole('option').find(option=>option.textContent.includes('CUBIC / CUBIC'));assert.ok(option);await act(async()=>{fireEvent.pointerDown(option,{pointerType:'mouse',button:0});fireEvent.click(option);});assert.equal(screen.getByRole('button',{name:'Previous'}).disabled,true);assert.ok(screen.getByText('0 scheduled trials in this selection'));
});

test('incomplete and completed delay campaigns keep unbounded estimates and missing preflights explicit',()=>{
 const data=delayData();data.campaign.status='completed';data.campaign.planned_trials=1;data.trials=[{...data.trials[0],status:'completed'}];data.latency=[];
 data.summaries[0]={...data.summaries[0],baseline_delta:null,treatment_delta:null,unbounded:true};
 render(React.createElement(StudyDashboard,{data}));assert.equal(screen.queryByText(/Provisional estimates/),null);assert.ok(screen.getAllByText('Unbounded / undefined').length===2);assert.ok(screen.getByText('Worker preflight measurements have not been ingested yet.'));
 cleanup();data.configurations=[];data.summaries=[];data.trials=[];render(React.createElement(StudyDashboard,{data}));assert.ok(screen.getByText('No complete matched pairs have been analyzed for this experiment yet.'));
});

test('delay sensitivity and goodput charts preserve empty estimates actual units and warmup scope',()=>{
 render(React.createElement(GoodputTrace,{samples:[],warmupSeconds:10}));assert.ok(screen.getByText('No receiver intervals have been recorded for this trial.'));cleanup();
 const samples=[{flow_index:2,end_seconds:2,goodput_mbps:0},{flow_index:1,end_seconds:2,goodput_mbps:5},{flow_index:1,end_seconds:1,goodput_mbps:2}];const before=structuredClone(samples);
 render(React.createElement(GoodputTrace,{samples,warmupSeconds:10}));assert.ok(screen.getByRole('img',{name:'Receiver goodput over time, by flow'}));assert.deepEqual(samples,before);assert.equal(document.querySelectorAll('polyline').length,2);assert.ok(screen.getByText(/first 10 s excluded/));cleanup();
 const summaries=[{...delayData().summaries[0],baseline_delta:null,treatment_delta:1,treatment_ci_low:null,treatment_ci_high:null,unbounded:false}];render(React.createElement(SensitivityChart,{summaries}));assert.ok(screen.getByText('No estimate'));assert.equal(document.querySelectorAll('circle').length,0);assert.equal(document.querySelectorAll('rect').length,1);
});
test('BBRv1 paper values and imperfect equalization estimates retain their own experiment scope',()=>{
 const data=delayData();for(const config of data.configurations)config.cca_group='bbr1/bbr1';for(const summary of data.summaries)summary.cca_group='bbr1/bbr1';render(React.createElement(StudyDashboard,{data}));assert.ok(screen.getByText(/BBRv1 δ 4.58 → 0.27/));cleanup();
 for(const config of data.configurations)config.family='imperfect_equalization';data.summaries=[];render(React.createElement(StudyDashboard,{data}));assert.ok(screen.getByText(/Awaiting estimates/));cleanup();
 render(React.createElement(SensitivityChart,{summaries:[{...delayData().summaries[0],baseline_ci_high:null,baseline_delta:null}]}));assert.ok(screen.getByText('No estimate'));
});
test('imperfect equalization reports incomplete below above and unresolved threshold estimates separately',()=>{
 const data=delayData();for(const config of data.configurations)config.family='imperfect_equalization';data.summaries=[{...data.summaries[0],family:'imperfect_equalization'},{...data.summaries[0],family:'imperfect_equalization',flow_index:2,assessment:'inconclusive',treatment_ci_high:.5},{...data.summaries[0],family:'imperfect_equalization',flow_index:3,assessment:'inconclusive',treatment_ci_high:2,treatment_ci_low:1},{...data.summaries[0],family:'imperfect_equalization',flow_index:4,assessment:'inconclusive',treatment_ci_high:null,treatment_ci_low:null}];render(React.createElement(StudyDashboard,{data}));assert.ok(screen.getByText(/Flow 1: incomplete; Flow 2: upper interval below 1; Flow 3: lower interval at or above 1; Flow 4: threshold unresolved/));
});

function leoData(){
 const definitions=[{}, {requested_terminals:100000,placement:'population'}, {requested_terminals:100000,placement:'gcb-1000'}, {ku_gbps:2.5}, {placement:'uniform',satellites:100}, {placement:'uniform',satellites:100,requested_terminals:100000}, {placement:'uniform',satellites:200}, {beam_policy:'greedy-independent',variant:'alternative'}];
 const configurations=definitions.map((change,index)=>({id:'config-'+index,country:'tonga',constellation:'starlink_5shells',satellites:4408,requested_terminals:200000,deployed_terminals:180000,placement:'gcb-0',beam_policy:'greedy-coordinated',ku_gbps:1.28,variant:'paper',cells:3,...change}));
 const sample=(config,index,second=0)=>({id:'sample-'+index+'-'+second,configuration_id:config.id,second,capacity_gbps:index+1,served_cells:2,validation_errors:index===7?['Original model validation failure']:[]});
 const samples=[...configurations.map((config,index)=>sample(config,index)),sample(configurations[0],0,1),sample(configurations[0],0,20)];
 const summaries=[{country:'tonga',published_gbps:5,mean_gbps:3,min_gbps:2,max_gbps:4,relative_difference_percent:-40,failover_percent:0,snapshots:15,assessment:'discrepant'},{country:'haiti',published_gbps:1,mean_gbps:2,min_gbps:2,max_gbps:2,relative_difference_percent:100,failover_percent:200,snapshots:15,assessment:'discrepant'}];
 return {campaign:{recorded_samples:samples.length,planned_samples:samples.length,status:'completed'},configurations,samples,summaries};
}

test('LEO dashboard keeps published capacity deterministic state ranges and separate saturation results',()=>{
 const data=leoData();data.saturation=leoData();data.saturation.configurations=data.saturation.configurations.slice(0,1);data.saturation.samples=data.saturation.samples.filter(sample=>sample.configuration_id==='config-0');data.saturation.configurations[0].requested_terminals=2000000;const before=structuredClone(data);
 render(React.createElement(LeoDashboard,{data}));
 assert.ok(screen.getByText('Terminal-budget saturation follow-up'));assert.ok(screen.getByRole('img',{name:'Tonga high-budget capacity convergence'}));assert.ok(screen.getByText(/1,985.15%/));
 assert.ok(screen.getByText('Original model validation failure'));assert.ok(screen.getByText(/temporal ranges are not confidence intervals/i));
 assert.ok(screen.getByRole('img',{name:'Tonga placement capacity curves'}));assert.equal(screen.getByRole('link',{name:'Ask AI about Tonga'}).getAttribute('href'),'/leo-emergency-failover/chat?country=tonga');
 assert.deepEqual(data,before);assert.ok([...document.querySelectorAll('svg')].every(svg=>!svg.innerHTML.includes('NaN')));
});

test('LEO country selection retains missing scenarios without borrowing another country or campaign',async()=>{
 render(React.createElement(LeoDashboard,{data:leoData()}));assert.equal(screen.queryByText('Terminal-budget saturation follow-up'),null);
 await click('Haiti');assert.ok(screen.getAllByText('No matching recorded scenarios.').length>0);assert.equal(screen.getByRole('button',{name:'Haiti'}).getAttribute('aria-pressed'),'true');
 assert.equal(screen.getByRole('link',{name:'Ask AI about Haiti'}).getAttribute('href'),'/leo-emergency-failover/chat?country=haiti');
 assert.ok(screen.getByText('Recorded scenarios for Haiti (0)'));assert.equal(screen.queryByText('Original model validation failure'),null);
});

function reliableData(){
 const configurations=['CM','CU','RS','Synthetic missing'].map((algorithm,index)=>({id:'config-'+index,campaign_id:'reliable-main-v1',skewness:0.3,budget_bytes:131072,algorithm}));
 const statistic={median:0,min:0,max:0};const summaries=configurations.slice(0,3).map((c,index)=>({configuration_id:c.id,recorded:10,planned:10,failed:0,excluded:0,observed_keys:0,statistics:{outliers:index===1?{median:-1,min:0,max:1}:index===2?null:statistic,aae:statistic,are:statistic,interval_violations:null,lost_mass:statistic,nominal_bytes:statistic,allocated_counter_bytes:statistic,insert_mups:statistic,query_mqps:statistic}}));
 return {meta:{counts:{runs:0}},configurations,summaries,published:[{id:'paper-cell',metric:'Paper metric',location:'Table 1',units:'published units',values:{published:5}}],claims:[{id:'memory',description:'Original claim',assessment:'untested',evidence:'Original declared evidence',location:'Section 1',limitation:'No guarantee'}]};
}

test('reliable sketch dashboard distinguishes zero invalid missing and published measurements',()=>{
 render(React.createElement(ReliableDashboard,{data:reliableData()}));assert.ok(screen.getByRole('img',{name:'Outlier median and descriptive seed range'}));
 assert.ok(screen.getByText('Invalid or missing measurement'));assert.ok(screen.getAllByText('Missing measurement').length===2);assert.ok(screen.getByText(/Paper metric/));assert.ok(screen.getByText('Original declared evidence'));
 assert.ok(screen.getAllByRole('button',{name:'Prepare question'}).every(link=>link.getAttribute('href').startsWith('/reliable-sketch-study/chat?configuration=config-')));
 const first=within(screen.getAllByRole('table')[0]).getAllByRole('row')[1];assert.match(first.textContent,/10\/10; failed 0, excluded 0/);assert.match(first.textContent,/0 \/ 0/);
});

test('reliable sketch filters do not mix main nominal-memory runs with follow-up allocated-counter runs',async()=>{
 render(React.createElement(ReliableDashboard,{data:reliableData()}));await choose('Campaign','Follow-up · allocated counters');await choose('Skewness','1.2');await choose('Budget','8 KiB');
 assert.ok(screen.getByText('No recorded configuration matches these controls. Missing results remain missing.'));assert.equal(screen.queryByRole('img'),null);
});
