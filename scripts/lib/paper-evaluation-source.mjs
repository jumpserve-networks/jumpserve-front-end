import {createClient} from '@supabase/supabase-js';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {connectPaperMCP} from './paper-intake-mcp.mjs';
import {privateDirectory} from './paper-evaluation-store.mjs';
import {extractPaperPDF} from '../../lib/paper-intake-pdf.ts';
import {sha256} from '../../lib/paper-intake-model.ts';

/** Read a saved paper for isolated prompt evaluations. Never writes assessment rows. */
export async function assessmentEvaluationSource(id){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw new Error('A valid saved-assessment UUID is required.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 const ref=url?.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co$/)?.[1];if(!ref||!key)throw new Error('Configure the Supabase project and server key for private paper access.');
 const trace=resolve('.test-artifacts/paper-intake-source-reads',id,randomUUID());await privateDirectory(trace);
 const mcp=await connectPaperMCP(ref,trace);
 try{
  const original=await mcp.original(id,{allowConfirmed:true});
  // Supabase MCP has no object-download tool; only Storage bytes use the SDK.
  const storage=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(25000)})}}).storage;
  const result=await storage.from('research-paper-uploads').download(`${id}/${original.identity.sha256}`);
  if(result.error||!result.data)throw new Error('The saved private source PDF could not be retrieved.');
  const bytes=new Uint8Array(await result.data.arrayBuffer()),paper=await extractPaperPDF(bytes,original.identity);
  return {paper,source:{assessment_id:id,sha256:sha256(bytes),byte_count:bytes.length},trace:join(trace,'mcp-002.json')};
 }finally{await mcp.close();}
}
