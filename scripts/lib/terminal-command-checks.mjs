import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {TERMINAL_COMMAND_LAYOUT,terminalClipboard,terminalInputsClipboard,terminalActionRefs,terminalSetupRequired} from '../../lib/paper-terminal-commands.ts';
import {experimentActions} from '../../lib/paper-experiment-plan.ts';

/** Parse only. Neither Bash nor Python executes the generated program. */
export function terminalSyntaxChecks(blocks,study,index,layout=TERMINAL_COMMAND_LAYOUT){
 const syntax=[],python_syntax=[];
 for(const [ref,block] of blocks){
  if(block.kind!=='terminal')continue;
  const result=spawnSync('/bin/bash',['--noprofile','--norc','-n'],{input:terminalClipboard(block,study,index,layout),encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH}});
  syntax.push({ref,passed:result.status===0,error:result.stderr?.trim()||result.error?.message||null});
  const lines=block.commands.split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
   const match=lines[i].match(/<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/);if(!match)continue;
   const opening=lines[i],body=[];let closed=false;
   while(++i<lines.length){const line=match[1]?lines[i].replace(/^\t+/,''):lines[i];if(line===match[3]){closed=true;break;}body.push(line);}
   if(!closed||!(/\bpython(?:3)?\b/.test(opening)||/\.py['"]?\s*(?:<<|$)/.test(opening)||/^#![^\n]*\bpython(?:3)?\b/.test(body[0]??'')))continue;
   const checked=spawnSync('python3',['-I',fileURLToPath(new URL('./check-terminal-python.py',import.meta.url))],{input:body.join('\n'),encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH}});
   let inspected;try{inspected=JSON.parse(checked.stdout);}catch{}
   python_syntax.push({ref,heredoc:match[3],passed:checked.status===0,programs:inspected?.programs??0,error:inspected?.errors?.join('\n')||checked.stderr?.trim()||checked.error?.message||null});
  }
 }
 return{passed:syntax.every(check=>check.passed)&&python_syntax.every(check=>check.passed),syntax,python_syntax};
}
export function terminalCommandText(set,source,index,layout=TERMINAL_COMMAND_LAYOUT){
 const refs=terminalActionRefs(source.plan,index),actions=experimentActions(source.plan.experiments[index-1]);
 const lines=['Generated terminal commands — Ubuntu/Debian Linux, Bash',`Assessment: ${source.study_id}`,`Experiment ${index}: ${source.plan.experiments[index-1].title}`,'Review before running. This evaluation parsed code without executing generated commands.',''];
 if(set.inputs.length){lines.push('INPUTS TO SET IN THE SAME BASH TERMINAL',...set.inputs.map(i=>`${i.name}: ${i.description}${i.secret?' (private value)':''}`),'',terminalInputsClipboard(set.inputs),'');}
 for(const [label,block] of [...(terminalSetupRequired(set)?[['SAVED SETUP',set.setup]]:[]),...refs.map((ref,i)=>[`${ref} ${actions[i].title}`,set.actions[ref]]),['EXPERIMENT CLEANUP',set.cleanup]]){
  lines.push(label,`Type: ${block.kind}${block.needs_sudo?' — uses sudo':''}`,block.notes,...(block.prerequisites.length?[`Prerequisites: ${block.prerequisites.join(', ')}`]:[]),`Completion check: ${block.verification}`,'');
  if(block.kind==='terminal')lines.push(terminalClipboard(block,source.study_id,index,layout));lines.push('');
 }
 return lines.join('\n');
}
