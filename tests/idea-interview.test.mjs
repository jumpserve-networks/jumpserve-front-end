import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('./')&&!specifier.endsWith('.ts')?specifier+'.ts':specifier,context);}});
const {interviewQuestion,interviewTurns}=await import('../lib/idea-interview.ts');
hook.deregister();
const run={id:'run',task:'planning',packet_id:'new',status:'complete',created_at:'2026-10-14T10:00:00Z',provenance:{interview:{version:'idea-interview-v1'},provider_message:{content:[{toolUse:{name:'submit_idea_question',input:{field:'conditions'}}}]}},output:{questions:['Which CDN providers, region and recent-request window?']}};
const state={current_packet_id:'new',packets:[],runs:[run]};
test('only a valid current-packet interview can select an answer field',()=>{
 assert.equal(interviewQuestion(state).field.id,'conditions');
 for(const variant of [{...run,packet_id:'old'},{...run,status:'invalid-output'},{...run,output:{questions:['one','two']}},{...run,provenance:{interview:{version:'idea-interview-v1',field:'execute'}}}])assert.equal(interviewQuestion({...state,runs:[variant]}),null);
 assert.equal(interviewQuestion(state,{id:'metrics'}),null);
});
test('a failed latest turn cannot revive an older tailored question',()=>assert.equal(interviewQuestion({...state,runs:[run,{...run,id:'failed',status:'failed'}]}),null));
test('conversation restoration keeps older failed replies and exact saved answers',()=>{
 const packets=[{id:'packet',reason:'Guided answer: Conditions and population',created_at:'2026-10-14T09:00:00Z',version:2}];
 const turns=interviewTurns({...state,packets,runs:[run,{...run,id:'failed',status:'failed',created_at:'2026-10-14T11:00:00Z'}]});
 assert.deepEqual(turns.map(t=>t.kind),['answer','reply','reply']);assert.equal(turns[0].packet,packets[0]);assert.equal(turns[2].run.status,'failed');
});
