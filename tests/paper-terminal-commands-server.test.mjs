import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {TERMINAL_COMMAND_LAYOUT,LEGACY_TERMINAL_LAYOUT} from '../lib/paper-terminal-commands.ts';
import {terminalCommandFixture,legacyTerminalCommandFixture,terminalFixtureRecord} from './support/terminal-command-fixture.mjs';
globalThis.__terminalServer={};
const hook=registerHooks({resolve(name,context,next){
 if(name==='server-only')return{shortCircuit:true,url:'data:text/javascript,export {};'};
 if(name==='./paper-intake-server')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export const intakeDatabase=async()=>globalThis.__terminalServer.db;export const modelClient=async()=>globalThis.__terminalServer.model;')};
 if(name==='./paper-experiment-plan-server')return{shortCircuit:true,url:'data:text/javascript,export class ExperimentPlanError extends Error {constructor(message,status){super(message);this.status=status;}}'};
 return next(name,context);
}});
const server=await import('../lib/paper-terminal-commands-server.ts');hook.deregister();
let calls,rows,queryError,s;
beforeEach(()=>{
 calls=[];rows=[];queryError=null;s=globalThis.__terminalServer;
 s.db={from(table){assert.equal(table,'research_terminal_commands');const filters={};return{select(){return this;},eq(key,value){filters[key]=value;return this;},in(key,values){filters[key]=values;return this;},async maybeSingle(){calls.push(['read',{...filters}]);return{error:queryError,data:rows.find(row=>Object.entries(filters).every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value))??null};}};},async rpc(name,args){calls.push(['save',name,args]);return{data:{...terminalFixtureRecord(),command_layout:args.p_payload.command_layout,status:args.p_operation==='finish'?'ready':'processing',admitted:false},error:null};}};
 s.model={responses:{async retrieve(id){calls.push(['retrieve',id]);return{id,status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(legacyTerminalCommandFixture())}]}]};},async create(){throw new Error('No replacement model call is allowed in these tests');}}};
});
const record=()=>({...terminalFixtureRecord(),target:'ubuntu-debian'});
test('owner reads select the per-step version and retain only pending legacy calls as a reconciliation fallback',async()=>{
 const modern=record(),old={...record(),command_layout:LEGACY_TERMINAL_LAYOUT,status:'ready'};rows=[old,modern];assert.equal(await server.loadTerminalCommands(modern.study_id,modern.owner_id,1),modern);assert.equal(calls.length,1);
 rows=[old];assert.equal(await server.loadTerminalCommands(old.study_id,old.owner_id,1),null);
 old.status='processing';assert.equal(await server.loadTerminalCommands(old.study_id,old.owner_id,1),old);
 assert.equal(await server.loadTerminalCommands(old.study_id,'someone-else',1),null);
});
test('legacy completion saves to its original layout then exposes missing new commands for automatic preparation',async()=>{
 const old={...record(),command_layout:LEGACY_TERMINAL_LAYOUT};assert.equal(await server.refreshSavedTerminalCommands(old),null);
 const saved=calls.find(call=>call[0]==='save');assert.equal(saved[2].p_payload.command_layout,LEGACY_TERMINAL_LAYOUT);assert.deepEqual(saved[2].p_payload.command_set,legacyTerminalCommandFixture());assert.equal(calls.filter(call=>call[0]==='retrieve').length,1);
});
test('new requests save complete standalone commands while uncertain legacy calls remain unreplayed',async()=>{
 const modern=record();s.model.responses.retrieve=async id=>({id,status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(terminalCommandFixture())}]}]});
 assert.equal((await server.refreshSavedTerminalCommands(modern)).status,'ready');assert.equal(calls.find(call=>call[0]==='save')[2].p_payload.command_layout,TERMINAL_COMMAND_LAYOUT);
 calls.length=0;const uncertain={...record(),command_layout:LEGACY_TERMINAL_LAYOUT,status:'uncertain',provider_response_id:null};assert.equal(await server.refreshSavedTerminalCommands(uncertain),uncertain);assert.equal(calls.length,0);
});
test('a missing layout migration is reported before model generation',async()=>{
 queryError={code:'42703',message:'column command_layout does not exist'};const row=record();await assert.rejects(()=>server.loadTerminalCommands(row.study_id,row.owner_id,1),error=>error.status===424&&/database update/.test(error.message));assert.equal(calls.filter(call=>call[0]==='save').length,0);
});
