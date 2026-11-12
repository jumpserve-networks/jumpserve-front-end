import {extractionBreakdown} from '../../lib/paper-intake-model.ts';
import {readPaperExtraction} from '../../lib/paper-intake-runner.ts';
import {PAPER_SOURCE_FORMAT_V3} from '../../lib/paper-source-references.ts';
export const evidencePaper={totalPages:4,pages:[
 {page:1,text:'Synthetic software fixture. This invented manuscript has fabricated benchmark values, not empirical measurements. Use two Linux hosts with a 50 Mb/s path and 10 ms each direction. Use a single TCP stream.'},
 {page:2,text:'Test loss at 0%, 3%, and 6%, with two 20-second trials per setting. Randomize order. Record receiver goodput, idle RTT, retransmissions and raw logs. Compute arithmetic means and 100*(G3-G0)/G0. The minimum 0% versus 3% comparison is a subset of this sweep.'},
 {page:3,text:'H1: Mean goodput at 3% loss is about 20% higher than at 0%. H2: Means strictly increase at every successive loss setting. H3: Idle RTT is near 20 ms. Reported invented mean goodputs are 30, 36 and 40 Mb/s. Queue sizes and burst parameters are unspecified.'},
 {page:4,text:'Retain exact qdisc configuration and kernel version. These measurements are invented. Verify path constraints and report variance; the table is not independent evidence.'},
]};
const item=(kind,description,source_refs,extra={})=>({kind,description,source_refs,label:null,criterion:null,specification:null,...extra});
export function evidenceOutput(){return {title:null,domain:null,authors:[],provenance:{classification:'synthetic',statement:'Invented manuscript with fabricated benchmark values.',source_refs:['p1s1','p4s1']},implementation_choices:[{name:'Queue and burst settings',reason:'Select and record unspecified queue sizes and burst parameters.',source_refs:['p3s1','p4s1']}],sections:{
 access:[item('requirement','Use two Linux hosts with a single TCP stream.',['p1s1'])],
 experiment:[item('experiment_specification','Run one loss sweep and its minimum comparison subset.',['p1s1','p2s1'],{specification:{setup:'Use two hosts, a 50 Mb/s path and 10 ms each direction.',conditions:'Test 0%, 3%, and 6% loss with two 20-second trials per setting.',procedure:'Randomize order and record receiver goodput, idle RTT, retransmissions and raw logs.',comparisons:'Use arithmetic means and 100*(G3-G0)/G0; the minimum 0% versus 3% contrast is a subset.'}})],
 data:[item('reported_result','Paper-reported invented goodputs are 30, 36 and 40 Mb/s.',['p3s1','p4s1'])],
 validate:[
  item('claim','H1 claims about 20% higher mean goodput at 3% versus 0% loss.',['p2s1','p3s1'],{label:'H1',criterion:{metric:'100*(G3-G0)/G0 (%)',comparison:'3% versus 0% loss means',target:'About 20%',acceptance:'needs_definition',tolerance:null}}),
  item('claim','H2 claims strictly increasing condition means.',['p2s1','p3s1'],{label:'H2',criterion:{metric:'Mean receiver goodput (Mb/s)',comparison:'All successive grid conditions',target:'G0 < G3 < G6',acceptance:'paper_defined',tolerance:null}}),
  item('claim','H3 claims idle RTT near 20 ms.',['p1s1','p3s1'],{label:'H3',criterion:{metric:'Idle RTT (ms)',comparison:'No bulk transfer versus 20 ms target',target:'Near 20 ms',acceptance:'needs_definition',tolerance:null}}),
 ]}};}
export function evidenceResponse(output=evidenceOutput()){return {id:'resp_fixture',status:'completed',text:{format:{type:'json_schema',name:PAPER_SOURCE_FORMAT_V3}},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]};}
export function evidenceBreakdown(){return extractionBreakdown(readPaperExtraction(evidenceResponse(),evidencePaper),evidencePaper,'synthetic-source','synthetic-text');}
export function evidencePlan(){return {experiments:[{title:'One sweep',experiment_refs:['experiment-1'],steps:[1,2,3].map(n=>({title:'Check H'+n,instructions:'Calculate and report the separate claim outcome using independent measurements.',basis:'paper',source_refs:['experiment-1','validate-'+n],validation_ref:'validate-'+n})),open_questions:['Define tolerances before execution for H1 and H3.','Select and record queue sizes and burst parameters.']}]};}
