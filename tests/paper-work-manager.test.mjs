import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PaperWorkManager} from '../lib/paper-work-manager.ts';
import {PAPER_WORK_STATUS_VERSION,validatePaperWorkListing,paperWorkActivities} from '../lib/paper-work-status.ts';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const unit=(changes={})=>({id,title:'Retained paper',step:3,index:1,total:1,stage:'processing',reason:null,updated_at:'2026-11-17T12:00:00Z',...changes});
const listing=(units=[])=>({version:PAPER_WORK_STATUS_VERSION,study_ids:[id],units,next_cursor:0});
const storage=()=>{const data=new Map();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t){let response=listing();const local=storage(),calls=[];const manager=new PaperWorkManager('owner',async(cursor,signal)=>{calls.push({cursor,signal});if(response instanceof Error)throw response;return response;});t.after(()=>manager.stop());manager.start(local);return{manager,local,calls,set:value=>{response=value;}};}
test('a submission belongs to the shared manager and completion stays visible after its page is gone',async t=>{
 const f=fixture(t);await settle();let finish,signal;const metadata={id,title:'Retained paper',step:3};const promise=f.manager.perform(metadata,s=>{signal=s;return new Promise(resolve=>{finish=resolve;});});await settle();
 assert.equal(f.manager.hasSubmissions(),true);assert.equal(signal.aborted,false);assert.equal(f.manager.getSnapshot().activity[0].stage,'processing');finish({stage:'processing'});await promise;
 assert.equal(f.manager.hasSubmissions(),false);f.set(listing([unit({stage:'ready'})]));await settle();await f.manager.refresh();assert.equal(f.manager.getSnapshot().activity[0].stage,'ready');
 const persisted=f.local.getItem(f.manager.storageKey);assert.ok(persisted.includes(id+':3'));assert.ok(!persisted.includes('Retained paper'));assert.ok(!persisted.includes('processing'));
});
test('duplicate mounts share one admission and root lifecycle cleanup fences old-account results',async t=>{
 const f=fixture(t);await settle();let finish,signal,calls=0;const operation=s=>{calls++;signal=s;return new Promise(r=>{finish=r;});};
 const first=f.manager.perform({id,title:'Paper',step:4,index:1,total:1},operation),second=f.manager.perform({id,title:'Paper',step:4,index:1,total:1},operation);assert.equal(first,second);await settle();assert.equal(calls,1);
 f.manager.stop();assert.equal(signal.aborted,true);finish({stage:'ready'});await first;assert.deepEqual(f.manager.getSnapshot().activity,[]);
 const next=new PaperWorkManager('other-owner',async()=>listing());t.after(()=>next.stop());next.start(f.local);await settle();assert.deepEqual(next.getSnapshot().activity,[]);assert.notEqual(next.storageKey,f.manager.storageKey);
});
test('reload restores completion and a dismissed pending popup returns for the finished stage',async t=>{
 const f=fixture(t);f.set(listing([unit()]));await settle();await f.manager.refresh();const pending=f.manager.getSnapshot().activity[0];f.manager.dismiss(pending);assert.equal(f.manager.getSnapshot().activity.length,0);f.manager.stop();
 const restored=new PaperWorkManager('owner',async()=>listing([unit({stage:'ready'})]));t.after(()=>restored.stop());restored.start(f.local);await settle();assert.equal(restored.getSnapshot().activity[0].stage,'ready');restored.dismiss(restored.getSnapshot().activity[0]);await restored.refresh();assert.equal(restored.getSnapshot().activity.length,0);
});
test('terminal records are not newly announced until observed running or started in this browser',async t=>{
 const f=fixture(t);await settle();f.set(listing([unit({stage:'ready'})]));await f.manager.refresh();assert.equal(f.manager.getSnapshot().activity.length,0);
});
test('cross-tab preferences merge before writes and never copy another owner notification',async t=>{
 const f=fixture(t);await settle();f.set(listing([unit()]));await f.manager.refresh();
 const external={version:1,watched:[other+':4'],dismissed:[other+':4:ready']};f.local.setItem(f.manager.storageKey,JSON.stringify(external));
 f.manager.dismiss(f.manager.getSnapshot().activity[0]);const saved=JSON.parse(f.local.getItem(f.manager.storageKey));assert.ok(saved.watched.includes(other+':4'));assert.ok(saved.dismissed.includes(other+':4:ready'));assert.ok(saved.dismissed.includes(id+':3:working'));
 const next=new PaperWorkManager('another-owner',async()=>listing([unit({stage:'ready'})]));t.after(()=>next.stop());next.start(f.local);await settle();assert.deepEqual(next.getSnapshot().activity,[]);
});
test('child mount intent is persisted when the root starts before the request microtask',async t=>{
 const local=storage(),manager=new PaperWorkManager('owner',async()=>{throw Error('Offline status');});t.after(()=>manager.stop());
 const submission=manager.perform({id,title:'Paper',step:3},async()=>({stage:'processing'}));manager.start(local);await submission;
 assert.ok(JSON.parse(local.getItem(manager.storageKey)).watched.includes(id+':3'));assert.equal(manager.getSnapshot().activity[0].stage,'processing');
});
test('Step 4 becomes ready only when every experiment package is ready',()=>{
 const first=unit({step:4,total:2,stage:'ready'}),second=unit({step:4,total:2,index:2,stage:'processing'});
 assert.equal(paperWorkActivities([first,second])[0].stage,'processing');assert.equal(paperWorkActivities([first])[0].stage,'not_generated');
 assert.equal(paperWorkActivities([first,{...second,stage:'failed'}])[0].stage,'failed');assert.equal(paperWorkActivities([first,{...second,stage:'ready'}])[0].stage,'ready');
 assert.throws(()=>validatePaperWorkListing(listing([first])),/incomplete/);
});
test('lost acknowledgements are checked against saved status without replaying submissions',async t=>{
 const f=fixture(t);await settle();let submissions=0;
 await assert.rejects(f.manager.perform({id,title:'Paper',step:3},async()=>{submissions++;throw Error('Lost acknowledgement');}),/Lost acknowledgement/);
 assert.equal(f.manager.getSnapshot().activity[0].stage,'uncertain');await settle();f.set(listing([unit()]));await f.manager.refresh();assert.equal(f.manager.getSnapshot().activity[0].stage,'processing');assert.equal(submissions,1);
 f.set(new Error('Saved status temporarily unavailable'));await f.manager.refresh();assert.equal(f.manager.getSnapshot().activity[0].stage,'processing');assert.match(f.manager.getSnapshot().error,/temporarily/);
});
test('reload uses stored identifiers only and stale metadata cannot roll back a newer submission',async t=>{
 let resolve;const manager=new PaperWorkManager('owner',()=>new Promise(r=>{resolve=r;}));t.after(()=>manager.stop());manager.start(storage());
 await manager.perform({id,title:'Paper',step:3},async()=>({stage:'ready'}));resolve(listing([unit()]));await settle();assert.equal(manager.getSnapshot().activity[0].stage,'ready');
});
test('earlier known pending calls resume their original Step 4 intent without page ownership',async t=>{
 const f=fixture(t);await settle();let reads=0;
 const op=async()=>{reads++;return reads===1?{stage:'not_generated',prior_pending:1}:{stage:'processing',prior_pending:0};};
 await f.manager.perform({id,title:'Paper',step:4,index:1,total:1,resume:true},op);await settle();await f.manager.refresh();await settle();assert.ok(reads>=2);assert.equal(f.manager.getSnapshot().activity[0].stage,'processing');
});
test('invalid, incomplete and cross-study metadata is rejected without erasing recorded work',()=>{
 for(const bad of [listing([unit({id:other})]),listing([unit({stage:'invented'})]),listing([unit(),unit()]),{...listing(),next_cursor:9001}])assert.throws(()=>validatePaperWorkListing(bad));
});
