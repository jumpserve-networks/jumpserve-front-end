import {evidencePaper,evidenceOutput} from '../../tests/support/paper-evidence-fixture.mjs';
import {PAPER_SOURCE_FORMAT_V5} from '../../lib/paper-source-references.ts';
const title='A Synthetic Loss-Sweep Benchmark';
const paper=structuredClone(evidencePaper);
paper.pages[0].text=title+'\n'+paper.pages[0].text;
paper.pages[2].text+=' The fabricated table gives a relative gain of exactly 20.0% for the 3% versus 0% comparison; this is arithmetic, not a separate hypothesis.';
paper.pages[3].text+=' Kernel pacing, MTU, offloads and socket buffers may affect findings. Router hierarchy, queue limits and bursts are unspecified.';
const reference=evidenceOutput();
reference.title={text:title,source_ref:'p1s1'};
reference.sections.data[0].description='The paper reports fabricated mean goodputs of 30, 36 and 40 Mb/s, giving a derived 20.0% gain for 3% versus 0% loss.';
const requirement=(description,refs,kind='requirement')=>({description,kind,source_refs:refs,label:null,criterion:null,specification:null});
reference.sections.data.push(requirement('Record receiver goodput, idle RTT, retransmissions and raw logs for each trial.',['p2s1']),requirement('Compute condition means and relative percentage gain using 100*(G3-G0)/G0.',['p2s1']));
reference.sections.validate.push(requirement('Verify that the emulator meets its configured path constraints.',['p4s1']),requirement('Report variance; do not accept the invented table as independent evidence.',['p4s1'],'limitation'));
reference.implementation_choices[0]={name:'Queue hierarchy, limits and bursts',reason:'Select and retain queue hierarchy, limits and burst settings; the manuscript does not specify them.',source_refs:['p4s1']};
reference.implementation_choices.push({name:'Kernel environment settings',reason:'Record selected kernel pacing, MTU, offloads and socket buffers because they may affect findings.',source_refs:['p4s1']},{name:'Seed and trial state',reason:'Select and record randomization seeds and startup/reset policy for the finite-duration trials.',source_refs:['p2s1']});
for(const item of reference.sections.experiment) item.specification=Object.fromEntries(Object.entries(item.specification).map(([key,text])=>[key,{text,source_refs:[key==='setup'?'p1s1':'p2s1']}]));
export const reviewQualityCase={id:'derived-calculation-trap',paper,reference,reference_format:PAPER_SOURCE_FORMAT_V5,expected:{title,authors:[],required:['access','experiment','data','validate'],quality:{
 provenance:'synthetic',experiment_count:1,reported_attribution:true,
 claims:[{label:'H1',acceptance:'needs_definition',metric_mentions:['%','percent','relative']},{label:'H2',acceptance:'paper_defined'},{label:'H3',acceptance:'needs_definition'}],
 details:[
  {name:'collection requirement',section:'data',kind:'requirement',mentions:[['goodput','throughput'],['record','collect']],evidence:['Record receiver goodput']},
  {name:'minimum subset stays in the sweep',section:'experiment',mentions:[['minimum','subset'],['0%','0 %'],['3%','3 %']],evidence:['minimum 0% versus 3%'],pages:[2]},
  {name:'setup validity check',section:'validate',kind:'requirement',mentions:[['constraint']],evidence:['Verify path constraints']},
  {name:'uncertainty reporting',section:'validate',mentions:[['variance','uncertainty','confidence']],evidence:['report variance']},
  {name:'queue hierarchy choices',section:'implementation_choices',mentions:[['hierarchy','order']],evidence:['Router hierarchy']},
  {name:'queue burst choices',section:'implementation_choices',mentions:[['burst']],evidence:['burst']},
  {name:'environment choices use actual context',section:'implementation_choices',mentions:[['MTU'],['offload']],evidence:['Kernel pacing, MTU, offloads and socket buffers'],pages:[4]},
  {name:'randomness choices',section:'implementation_choices',mentions:[['seed']],pages:[2]},
  {name:'trial state choices',section:'implementation_choices',mentions:[['startup','warm-up','warmup','reset']],pages:[2]},
 ],
}}};
