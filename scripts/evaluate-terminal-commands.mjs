// Browser-free, one original model call per named run. Never executes generated commands.
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import env from '@next/env';
import OpenAI from 'openai';
import {terminalCommandsRequest} from '../lib/paper-terminal-commands-model.ts';
import {readTerminalCommands} from '../lib/paper-terminal-commands-runner.ts';
import {TERMINAL_COMMAND_LAYOUT,LEGACY_TERMINAL_LAYOUT,terminalActionRefs} from '../lib/paper-terminal-commands.ts';
import {validateExperimentPlan} from '../lib/paper-experiment-plan.ts';
import {applyExperimentPlanLinkReview} from '../lib/paper-experiment-plan-review.ts';
import {sha256} from '../lib/paper-intake-model.ts';
import {connectPaperMCP} from './lib/paper-intake-mcp.mjs';
import {paperCLIError} from './lib/paper-cli-errors.mjs';
import {RUN_NAME,privateDirectory,privateJSON,readJSON,lockRun} from './lib/paper-evaluation-store.mjs';
import {terminalCommandFixture,terminalFixtureRecord} from '../tests/support/terminal-command-fixture.mjs';
import {terminalSyntaxChecks,terminalCommandText} from './lib/terminal-command-checks.mjs';
const uuid=value=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value??'');
const identity=run=>sha256(JSON.stringify({source:run.source,index:run.index,request:run.request,...(run.command_layout?{command_layout:run.command_layout}:{})}));
const layout=run=>{const value=run.command_layout??LEGACY_TERMINAL_LAYOUT;if(![TERMINAL_COMMAND_LAYOUT,LEGACY_TERMINAL_LAYOUT].includes(value))throw new Error('Unknown saved command layout.');return value;};
function grade(run){
 if(run.identity!==identity(run))throw new Error('The saved command-generation inputs changed.');
 validateExperimentPlan(run.source.plan,run.source.confirmed_breakdown);
 let set;try{set=readTerminalCommands(run.response,{source_plan:run.source.plan,confirmed_breakdown:run.source.confirmed_breakdown,experiment_index:run.index,command_layout:layout(run)});}catch(error){return{passed:false,command_layout:layout(run),validation_error:error instanceof Error?error.message:'Command validation failed.',commands_executed:0,experiments_started:0};}
 const refs=terminalActionRefs(run.source.plan,run.index);
 const blocks=[['setup',set.setup],...refs.map(ref=>[ref,set.actions[ref]]),['cleanup',set.cleanup]];
 return{...terminalSyntaxChecks(blocks,run.source.study_id,run.index,layout(run)),command_layout:layout(run),actions:refs.length,terminal_actions:refs.filter(ref=>set.actions[ref].kind==='terminal').length,manual_actions:refs.filter(ref=>set.actions[ref].kind==='manual').length,blocked_actions:refs.filter(ref=>set.actions[ref].kind==='blocked').length,commands_executed:0,experiments_started:0,limitation:'Exposed schema, Bash/Python parsing and known local-helper keyword checks only. No generated commands, network setup, experiments, or measurement ingestion were executed.'};
}
async function saveCommands(directory,run){
 const set=readTerminalCommands(run.response,{source_plan:run.source.plan,confirmed_breakdown:run.source.confirmed_breakdown,experiment_index:run.index,command_layout:layout(run)});
 await privateJSON(join(directory,'commands.json'),set);await writeFile(join(directory,'commands.txt'),terminalCommandText(set,run.source,run.index,layout(run)),{mode:0o600});
}
async function main(){
 const {values}=parseArgs({options:{live:{type:'boolean'},run:{type:'string'},replay:{type:'string'},assessment:{type:'string'},'from-plan':{type:'string'},experiment:{type:'string'},prompt:{type:'string'},help:{type:'boolean'}}});
 if(values.help){console.log('npm run eval:terminal-commands\nnpm run eval:terminal-commands -- --live --run NAME --assessment UUID [--experiment 1] [--prompt FILE]\nnpm run eval:terminal-commands -- --live --run NAME --from-plan FILE [--experiment 1]\nnpm run eval:terminal-commands -- --replay NAME\nOffline by default; at most one model call per frozen run. Assessment reads use Supabase MCP, output stays private on disk, and no database writes or generated command execution occur.');return;}
 const name=values.replay??values.run;if(name&&!RUN_NAME.test(name))throw new Error('Use a bounded run name with letters, numbers, dots, underscores or hyphens.');
 const directory=name?resolve('.test-artifacts/terminal-command-evaluations',name):null;
 if(values.replay){
  if(values.live||values.run||values.assessment||values['from-plan']||values.prompt||values.experiment)throw new Error('Replay uses only frozen inputs and the saved response.');
  const saved=await readJSON(join(directory,'run.json'));if(!saved?.response)throw new Error('No saved command response exists.');const report={mode:'replay',...grade(saved),model_calls:0};await privateJSON(join(directory,'replay-'+Date.now()+'.json'),report);if(report.passed)await saveCommands(directory,saved);console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;return;
 }
 if(!values.live){
  if(name||values.assessment||values['from-plan']||values.prompt||values.experiment)throw new Error('Use --live for an intentional new provider evaluation.');
  const fixture=terminalFixtureRecord(),source={study_id:fixture.study_id,plan:fixture.source_plan,confirmed_breakdown:fixture.confirmed_breakdown},request=terminalCommandsRequest(source.study_id,1,source.plan,source.confirmed_breakdown),saved={source,index:1,request,command_layout:TERMINAL_COMMAND_LAYOUT,response:{id:'resp_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(terminalCommandFixture())}]}]}};saved.identity=identity(saved);console.log(JSON.stringify({mode:'offline',...grade(saved),model_calls:0}));return;
 }
 if(!directory)throw new Error('Name every intentional live evaluation with --run.');
 if(values.assessment&&values['from-plan'])throw new Error('Choose one source.');
 const index=Number(values.experiment??'1');if(!Number.isSafeInteger(index)||index<1||index>8)throw new Error('Choose an experiment number from 1 to 8.');
 await privateDirectory(directory);const release=await lockRun(directory);
 try{
  env.loadEnvConfig(process.cwd());let saved=await readJSON(join(directory,'run.json'));
  if(saved){
   if(saved.identity!==identity(saved)||saved.index!==index||values.assessment&&values.assessment!==saved.source.study_id)throw new Error('Saved run inputs conflict with this invocation.');
   if(values['from-plan']){const current=JSON.parse(await readFile(values['from-plan'],'utf8'));if(!isDeepStrictEqual({study_id:current.study_id,plan:current.plan,confirmed_breakdown:current.confirmed_breakdown},saved.source))throw new Error('The supplied source differs from the frozen evaluation. Use a new run name.');}
   if(values.prompt&&await readFile(values.prompt,'utf8')!==saved.request.instructions)throw new Error('The candidate prompt differs from the frozen evaluation. Use a new run name.');
  }
  else{
   let source;
   if(values.assessment){
    if(!uuid(values.assessment))throw new Error('Supply an assessment UUID.');
    const project=process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co$/)?.[1];if(!project)throw new Error('Configure the intended Supabase project URL.');
    const mcp=await connectPaperMCP(project,directory);
    try{const owner=await mcp.original(values.assessment,{allowConfirmed:true});let row=await mcp.experimentPlan(owner.id,owner.owner_id);if(row?.status==='failed'){const review=await mcp.experimentPlanLinkReview(owner.id,owner.owner_id);if(review)row=applyExperimentPlanLinkReview(row,review);}if(row?.status!=='ready'||!row.plan)throw new Error('A ready saved experiment plan is required.');source={study_id:row.study_id,plan:row.plan,confirmed_breakdown:row.confirmed_breakdown};}finally{await mcp.close();}
   }else if(values['from-plan']){const value=JSON.parse(await readFile(values['from-plan'],'utf8'));source={study_id:value.study_id,plan:value.plan,confirmed_breakdown:value.confirmed_breakdown};}
   else throw new Error('Choose --assessment or --from-plan.');
   if(!uuid(source.study_id))throw new Error('The source assessment identity is invalid.');validateExperimentPlan(source.plan,source.confirmed_breakdown);
   let request=terminalCommandsRequest(source.study_id,index,source.plan,source.confirmed_breakdown);
   if(values.prompt){const instructions=await readFile(values.prompt,'utf8');if(!instructions.trim()||instructions.length>40000)throw new Error('Use bounded prompt instructions.');request={...request,instructions};}
   saved={source,index,request,command_layout:TERMINAL_COMMAND_LAYOUT,status:'prepared',token:randomUUID(),created_at:new Date().toISOString()};saved.identity=identity(saved);await privateJSON(join(directory,'run.json'),saved);
  }
  if(!saved.response_id&&saved.status!=='prepared')throw new Error('The original submission is retained and will not be repeated automatically.');
  const model=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:25000});
  if(!saved.response_id){
   saved.status='submitting';await privateJSON(join(directory,'run.json'),saved);
   try{const response=await model.responses.create(saved.request,{headers:{'X-Client-Request-Id':saved.token}});saved={...saved,response_id:response.id,response,status:response.status};await privateJSON(join(directory,'run.json'),saved);}
   catch(error){saved.status='uncertain';await privateJSON(join(directory,'run.json'),saved);throw error;}
  }
  const end=Date.now()+180000;
  while(['queued','in_progress'].includes(saved.response?.status)&&Date.now()<end){await delay(2000);const response=await model.responses.retrieve(saved.response_id);if(response.id!==saved.response_id)throw new Error('The response identity changed.');saved={...saved,response,status:response.status};await privateJSON(join(directory,'run.json'),saved);}
  if(['queued','in_progress'].includes(saved.response?.status))throw new Error('The original response is pending. Rerun this named evaluation to retrieve it; no new call will be made.');
  const report={mode:'live',...grade(saved),model_calls:1,response_id:saved.response_id,usage:saved.response.usage??null};await privateJSON(join(directory,'report.json'),report);if(report.passed)await saveCommands(directory,saved);console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
 }finally{await release();}
}
await main().catch(error=>{console.error(paperCLIError(error));process.exitCode=1;});
