// Exposed, invented software fixture; these are not empirical measurements.
import {PAPER_SOURCE_FORMAT_V6} from '../../lib/paper-source-references.ts';
const title='A Synthetic Dependency Procedure';
const paper={totalPages:3,pages:[
 {page:1,text:title+'\nThis is an invented software-test document; no empirical results are reported. First obtain two Linux hosts. Installing iperf3 requires those hosts. Python 3.11 is a separate prerequisite and does not depend on iperf3. Installing the CSV conversion utility requires Python 3.11.'},
 {page:2,text:'Run three 20-second iperf3 trials on the two hosts without introduced loss. Keep the path configuration constant across trials. The three trials form one experiment, not three separate experiments.'},
 {page:3,text:'Retain the raw byte counts and start/end times for each trial. Computing per-trial goodput requires those raw values. Computing mean goodput requires the per-trial goodputs. Check each trial duration against 20 seconds before accepting its goodput. These checks do not establish population-level generalization.'},
]};
const item=(description,page,depends_on=[],kind='requirement',specification=null)=>({description,source_refs:[`p${page}s1`],kind,label:null,criterion:null,specification,depends_on});
const field=(text)=>({text,source_refs:['p2s1']});
const reference={title:{text:title,source_ref:'p1s1'},domain:null,authors:[],provenance:{classification:'synthetic',statement:'Invented software-test document with no empirical results.',source_refs:['p1s1']},implementation_choices:[],sections:{
 access:[item('Obtain two Linux hosts.',1),item('Install iperf3 on those hosts.',1,[1]),item('Obtain Python 3.11 independently of iperf3.',1),item('Install the CSV conversion utility using Python 3.11.',1,[3])],
 experiment:[item('Run the repeated iperf3 experiment with a constant path.',2,[],'experiment_specification',{setup:field('Use iperf3 on the two hosts.'),conditions:field('Keep the path configuration constant without introduced loss.'),procedure:field('Run three 20-second trials.'),comparisons:field('The three trials share one experiment and its fixed path configuration.')})],
 data:[item('Retain raw byte counts and start/end times for each trial.',3),item('Compute per-trial goodput from the raw values.',3,[1]),item('Compute mean goodput from the per-trial goodputs.',3,[2])],
 validate:[item('Check trial duration against 20 seconds before accepting goodput.',3),item('Do not infer population-level generalization from these checks.',3,[],'limitation')],
}};
export const dependencyPaperCase={id:'section-dependencies',paper,reference,reference_format:PAPER_SOURCE_FORMAT_V6,expected:{title,authors:[],required:['access','experiment','data','validate'],dependencies:[
 {section:'access',child:['install','iperf3'],parent:['Linux','hosts']},
 {section:'access',child:['CSV','utility'],parent:['Python']},
 {section:'data',child:['per-trial','goodput'],parent:['raw','byte']},
 {section:'data',child:['mean','goodput'],parent:['per-trial','goodput']},
]}};
