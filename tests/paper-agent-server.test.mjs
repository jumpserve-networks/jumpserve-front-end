import assert from 'node:assert/strict';
import {after,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {agentRow} from './support/paper-agent-fixture.mjs';
globalThis.__paperAgentServer={};
const hook=registerHooks({resolve(name,context,next){const code=name==='server-only'?'export {};':name==='./paper-intake-server'?'export const intakeDatabase=async()=>globalThis.__paperAgentServer.db;export const modelClient=async()=>globalThis.__paperAgentServer.client;':name==='./paper-quality-server'?'export class PaperQualityError extends Error {constructor(message,status){super(message);this.status=status;}};':null;return code?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(code)}:next(name,context);}});
const {paperAgentOperations,assertPaperAgentRuntime}=await import('../lib/paper-agent-server.ts');after(()=>hook.deregister());
let calls,ack;
beforeEach(()=>{calls=[];ack=true;globalThis.__paperAgentServer.db={rpc:async(name,args)=>{calls.push(['rpc',name,args]);return{data:name==='research_paper_agent_capabilities'?{runtime:'managed-agents-v1',native_records:true}:args.p_operation==='action_ack'?ack:args.p_operation==='history_item'?{item_key:args.p_payload.item.id,retained_in:'research_paper_agent_items'}:true,error:null};}};globalThis.__paperAgentServer.client={beta:{agents:{sessions:{events:{create:async(...args)=>{calls.push(['events',...args]);}}}}}};});
test('provider tool acknowledgments recheck the retained stop and budget gate',async()=>{
 const row=agentRow(),ops=paperAgentOperations(row),result={success:true,output:'{"saved":true}'};
 ack=false;await ops.result('sess_fixture','turn_fixture','call_fixture',result,'original-key');assert.equal(calls.filter(c=>c[0]==='events').length,0);
 ack=true;await ops.result('sess_fixture','turn_fixture','call_fixture',result,'original-key');const event=calls.find(c=>c[0]==='events');assert.equal(event[1],'sess_fixture');assert.equal(event[3].headers['Idempotency-Key'],'original-key');assert.equal(event[2].events[0].call_id,'call_fixture');
 for(const call of calls.filter(c=>c[0]==='rpc')){assert.equal(call[2].p_actor,row.owner_id);assert.equal(call[2].p_call,row.call.id);}
});
test('native history streams complete originals into immutable rows before returning a bounded manifest',async()=>{
 const row=agentRow(),a={id:'msg_a',type:'message',content:[{type:'output_text',text:'a'.repeat(1100000)}]},b={id:'msg_b',type:'message',content:[{type:'output_text',text:'b'.repeat(1100000)}]};
 globalThis.__paperAgentServer.client.beta.agents.sessions.items={list:async()=>({data:[a],hasNextPage:()=>true,getNextPage:async()=>({data:[b],hasNextPage:()=>false})})};
 const items=await paperAgentOperations(row).items('sess_fixture');assert.equal(items.length,2);assert.ok(!JSON.stringify(items).includes('aaaa'));const retained=calls.filter(c=>c[0]==='rpc');assert.equal(retained.length,2);assert.equal(retained[0][2].p_payload.item.content[0].text.length,1100000);assert.equal(retained[1][2].p_payload.item.content[0].text.length,1100000);
});
test('missing database capabilities fail before managed admission or inference',async()=>{
 await assertPaperAgentRuntime();globalThis.__paperAgentServer.db.rpc=async()=>({data:null,error:{code:'PGRST202',message:'Function unavailable with private diagnostic.'}});await assert.rejects(()=>assertPaperAgentRuntime(),error=>error.status===424&&!error.message.includes('private diagnostic'));
});
