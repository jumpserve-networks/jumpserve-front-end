import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyIdea,ideaReview,validateIdeaState} from '../lib/research-ideas.ts';
import {getTestModuleForPath,RESEARCH_IDEAS_MODULE_PATH as PATH} from '../lib/test-modules.ts';
const document=emptyIdea();const raw=JSON.stringify(document);
const packet={id:'packet',study_id:'study',version:1,document,raw_document:raw,sha256:'a'.repeat(64)};
function state(){return {version:'research-ideas-v1',packets:[packet],runs:[],decisions:[],campaigns:[],current_packet_id:'packet',ready:false,missing:['hypothesis'],limitations:'Fixture'};}
function run(id='review'){return {id,study_id:'study',packet_id:'packet',task:'critic',session_id:null,status:'complete',output:{summary:'Fixture',questions:[],findings:[],verdict:'ready'},provenance:{context_policy:'fresh-packet-only',history_messages:0}};}
test('unpublished drafts preserve empty unknowns and have no candidate protocol',()=>{assert.equal(document.hypothesis,'');assert.equal(document.protocol,null);assert.equal(validateIdeaState(state(),'study').ready,false);});
test('new idea and planning paths belong to their own module',()=>{for(const suffix of ['/new-idea','/ideas/example'])assert.equal(getTestModuleForPath(PATH+suffix)?.id,'research-ideas');});
test('packet JSON key order is irrelevant but changed values, versions and hashes are refused',()=>{const s=state();s.packets=[{...packet,document:Object.fromEntries(Object.entries(document).reverse())}];assert.equal(validateIdeaState(s,'study'),s);for(const change of [{version:0},{sha256:''},{document:{...document,hypothesis:'changed'}}])assert.throws(()=>validateIdeaState({...state(),packets:[{...packet,...change}]},'study'));});
test('cross-study records and conflicting packet references never become ready',()=>{assert.throws(()=>validateIdeaState(state(),'other'));assert.throws(()=>validateIdeaState({...state(),current_packet_id:'missing'},'study'));assert.throws(()=>validateIdeaState({...state(),ready:true},'study'));});
test('fresh review metadata rejects planning history and cross-packet attempts',()=>{for(const change of [{session_id:'session'},{packet_id:'other'},{provenance:{context_policy:'planning',history_messages:2}}])assert.throws(()=>validateIdeaState({...state(),runs:[{...run(),...change}]},'study'));});
test('a later critical or failed review cannot be hidden by an earlier favorable recommendation',()=>{const s=state();s.runs=[run()];assert.equal(ideaReview(s,'critic').id,'review');for(const latest of [{...run('new'),status:'failed',output:null},{...run('new'),output:{summary:'Missing control',questions:['Which control?'],findings:[],verdict:'needs-clarification'}}])assert.equal(ideaReview({...s,runs:[...s.runs,latest]},'critic'),undefined);});
test('recorded readiness must reference the latest complete reviews of both roles',()=>{
 const critic=run('critic'),comprehension={...run('comprehension'),task:'comprehension'};
 const s={...state(),runs:[comprehension,critic],missing:[],ready:true,decisions:[{id:'decision',study_id:'study',packet_id:'packet',decision:'ready',comprehension_run_id:'comprehension',critic_run_id:'critic'}]};
 assert.equal(validateIdeaState(s,'study').ready,true);
 assert.throws(()=>validateIdeaState({...s,missing:['units']},'study'));
 assert.throws(()=>validateIdeaState({...s,runs:[...s.runs,{...run('later'),status:'failed',output:null}]},'study'));
});
