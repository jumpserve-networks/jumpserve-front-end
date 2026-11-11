import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {privateJSON} from './paper-evaluation-store.mjs';
const require=createRequire(import.meta.url);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const sql=value=>"'"+String(value).replaceAll("'","''")+"'";
export function mcpValue(result){
 if(result.isError)throw new Error('Supabase MCP rejected the operation; inspect the private run trace.');
 let value=result.structuredContent;
 if(!value){const block=result.content?.find(c=>c.type==='text');if(!block)throw new Error('Supabase MCP returned no structured result.');try{value=JSON.parse(block.text);}catch{value=block.text;}}
 value=value?.result??value;
 if(typeof value!=='string')return value;
 try{return JSON.parse(value);}catch{
  const match=value.match(/^<untrusted-data-([a-f0-9-]+)>[ \t]*\r?\n([\s\S]*?)\r?\n<\/untrusted-data-\1>[ \t]*$/im);
  if(!match)throw new Error('Supabase MCP result did not match the expected data envelope.');return JSON.parse(match[2]);
 }
}
export async function connectPaperMCP(projectRef,traceDirectory){
 if(!/^[a-z0-9]{20}$/.test(projectRef))throw new Error('A valid Supabase project reference is required.');
 let token=process.env.SUPABASE_ACCESS_TOKEN;
 if(!token){
  let config;try{config=JSON.parse(execFileSync('codex',['mcp','get','supabase','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}catch{throw new Error('Configure SUPABASE_ACCESS_TOKEN or an authorized Supabase MCP connection in Codex.');}
  token=config.transport?.env?.SUPABASE_ACCESS_TOKEN;
 }
 if(!token)throw new Error('The Supabase MCP management authorization is unavailable.');
 const server=join(dirname(require.resolve('@supabase/mcp-server-supabase')),'cli.js');
 const client=new Client({name:'jumpserve-paper-intake-operator-verifier',version:'1.0.0'},{capabilities:{}});
 const transport=new StdioClientTransport({command:process.execPath,args:[server,'--project-ref',projectRef],env:{PATH:process.env.PATH,SUPABASE_ACCESS_TOKEN:token},stderr:'pipe'});
 let counter=0;
 async function call(name,args){const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});await privateJSON(join(traceDirectory,'mcp-'+String(++counter).padStart(3,'0')+'.json'),result);return mcpValue(result);}
 try{
  await client.connect(transport);transport.stderr?.on('data',()=>{});
  const identity=await call('get_project_url',{});if(identity?.url!==`https://${projectRef}.supabase.co`)throw new Error('The Supabase MCP project does not match the configured database.');
 }catch(error){await client.close();throw error;}
 async function rows(query,readOnly=true){
  const result=await call('execute_sql',{query:readOnly?`begin transaction read only; ${query}; commit;`:query});
  if(!Array.isArray(result))throw new Error('Supabase MCP returned an unexpected row collection.');return result;
 }
 return {
  close:()=>client.close(),
  async original(id,{allowConfirmed=false}={}){
   if(!uuid(id))throw new Error('A valid assessment UUID is required.');
   const result=await rows(`select u.id,u.owner_id,u.paper->'paper_upload' as identity,r.status as review_status,coalesce(not a.is_anonymous,false) and exists(select 1 from auth.identities ai where ai.user_id=a.id and ai.provider='google') as google_linked_owner from public.research_paper_uploads u join public.research_study_owners o on o.study_id=u.id and o.owner_id=u.owner_id join public.research_paper_reviews r on r.study_id=u.id join auth.users a on a.id=u.owner_id where u.id=${sql(id)}::uuid limit 1`);
   if(result.length!==1||!uuid(result[0].owner_id)||!result[0].google_linked_owner)throw new Error('An existing Google-linked paper owner and private original upload are required.');
   if(result[0].review_status==='confirmed'&&!allowConfirmed)throw new Error('Confirmed historical assessments cannot be moved to phase one.');
   return result[0];
  },
  async load(id,owner){
   if(!uuid(id)||!uuid(owner))throw new Error('Valid paper and owner identities are required.');
   const result=await rows(`select to_jsonb(i) as intake from public.research_paper_intakes i where study_id=${sql(id)}::uuid and owner_id=${sql(owner)}::uuid`);return result[0]?.intake??null;
  },
  async save(operation,row,payload){
   if(!['reserve','begin','submitted','uncertain','failed','finish','cancel'].includes(operation)||!uuid(row.study_id)||!uuid(row.owner_id))throw new Error('Unsupported paper-intake operation or owner identity.');
   const result=await rows(`select public.research_paper_intake(${sql(operation)},${sql(row.owner_id)}::uuid,${sql(row.study_id)}::uuid,${sql(JSON.stringify(payload))}::jsonb) as intake`,false);
   if(result.length!==1||result[0].intake?.study_id!==row.study_id||result[0].intake?.owner_id!==row.owner_id)throw new Error('The saved intake identity does not match its owner.');return result[0].intake;
  },
  async evidence(id){
   if(!uuid(id))throw new Error('A valid paper identity is required.');
   const result=await rows(`select jsonb_build_object('intake',(select to_jsonb(i) from public.research_paper_intakes i where study_id=${sql(id)}::uuid),'events',(select coalesce(jsonb_agg(jsonb_build_object('revision',revision,'status',snapshot->>'status','created_at',created_at) order by revision),'[]') from public.research_paper_intake_events where study_id=${sql(id)}::uuid),'workflow',(select jsonb_build_object('status',status,'deadline_at',deadline_at,'committed_cents',committed_cents) from public.research_autonomy_workflows where study_id=${sql(id)}::uuid),'tasks',(select count(*) from public.research_autonomy_tasks where study_id=${sql(id)}::uuid),'dispatches',(select count(*) from public.research_model_dispatches where study_id=${sql(id)}::uuid),'jobs',(select count(*) from public.research_queue_jobs where study_id=${sql(id)}::uuid),'artifacts',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'sha256',sha256,'byte_count',byte_count)),'[]') from public.research_artifacts where study_id=${sql(id)}::uuid)) as evidence`);return result[0].evidence;
  },
 };
}
