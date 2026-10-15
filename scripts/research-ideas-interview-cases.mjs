// Fixed development wiring checks. Actual components/API/agent/Postgres;
// explicitly synthetic auth/model. Actual answer quality is evaluated separately.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

export async function interviewCases({page,api,headers,directory,check}) {
 let studyId;
 const idea=async()=>await(await fetch(api+'/research/studies/'+studyId+'/idea',{headers})).json();
 await check('opening an idea restores context without automatically requesting a model',async()=>{
  await page.getByLabel('Idea title',{exact:true}).fill('CDN request-history development fixture');
  await page.getByLabel('Research domain',{exact:true}).fill('Networking');
  await page.getByLabel('Research question',{exact:true}).fill('Can an external observer infer recent regional requests from public CDN headers and timing?');
  await page.getByLabel('Proposed hypothesis, if you have one',{exact:true}).fill('Under controlled conditions, distinguish zero from one-or-more recent requests better than chance across two CDNs.');
  await page.getByRole('button',{name:'Create private idea workspace',exact:true}).click();await page.waitForURL(/\/ideas\//);studyId=page.url().split('/ideas/')[1];
  await page.getByRole('button',{name:'Start conversation',exact:true}).waitFor();assert.equal((await idea()).runs.length,0);assert.equal(await page.getByLabel('Your answer',{exact:true}).count(),0);
  return {study_id:studyId,automatic_model_calls:0};
 });
 await check('tailored structured question maps to an allowed plan field and shows model provenance',async()=>{
  await page.getByRole('button',{name:'Start conversation',exact:true}).click();await page.getByRole('heading',{name:'For your CDN header-and-timing study, which providers, probe region and recent-request window will you test?',exact:true}).waitFor();
  const state=await idea();assert.equal(state.runs.length,1);assert.equal(state.runs[0].provenance.provider_message.content[0].toolUse.input.field,'conditions');assert.equal(state.runs[0].output.verdict,'needs-clarification');assert.equal(state.ready,false);assert.equal(state.packets.length,1);
  await page.getByText('AI provenance',{exact:true}).click();await page.getByText(/Prompt: ba16759e/).waitFor();return {field:'conditions',plan_unchanged:true,approval:false,provider:'synthetic software fixture'};
 });
 await check('asking for advice preserves an unsaved answer and does not write discussion into the plan',async()=>{
  const draft='CloudFront and Cloudflare, Frankfurt probes; a 60-second recent-request window.';
  await page.getByLabel('Your answer',{exact:true}).fill(draft);await page.getByLabel('Ask the guide',{exact:true}).fill('How could I assign objects to the two request-history groups?');await page.getByRole('button',{name:'Send question',exact:true}).click();
  await page.getByRole('heading',{name:/For your CDN comparison, could you use owner-controlled/}).waitFor();assert.equal(await page.getByLabel('Your answer',{exact:true}).inputValue(),draft);
  const state=await idea();assert.equal(state.packets.length,1);assert.equal(state.packets[0].document.conditions,'');assert.equal(state.runs.at(-1).provenance.provider_message.content[0].toolUse.input.field,'conditions');return {draft_preserved:true,discussion_is_not_fact:true};
 });
 await check('sending an exact answer saves first then recovers the same AI request after a lost acknowledgement',async()=>{
  let intercepted=false;const requests=[];await page.route('**/idea-model',async route=>{const b=route.request().postDataJSON();if(b.action==='idea'){requests.push(b);if(!intercepted){intercepted=true;await route.fetch();await route.fulfill({status:503,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({error:'Synthetic interview acknowledgement lost; recorded call retained.'})});return;}}await route.continue();});
  await page.getByRole('button',{name:'Send answer',exact:true}).click();await page.getByText('Synthetic interview acknowledgement lost; recorded call retained.',{exact:true}).waitFor();await page.getByRole('button',{name:'Retry the same AI request',exact:true}).click();await page.getByRole('heading',{name:/For those CDN objects and that window/}).waitFor();
  assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);const state=await idea();assert.equal(state.packets.length,2);assert.equal(state.packets.at(-1).document.conditions,'CloudFront and Cloudflare, Frankfurt probes; a 60-second recent-request window.');assert.equal(state.runs.length,3);assert.equal(requests[0].packet_id,state.current_packet_id);assert.equal(state.runs.at(-1).provenance.provider_message.content[0].toolUse.input.field,'design');await page.unroute('**/idea-model');return {versions:2,model_attempts:3,acknowledgement_retry_deduplicated:true,save_precedes_call:true};
 });
 await check('reload restores the conversation and exact current question across desktop/mobile themes',async()=>{
  await page.reload();await page.getByRole('heading',{name:/For those CDN objects and that window/}).waitFor();assert.equal((await idea()).runs.length,3);
  const history=page.getByLabel('Planning conversation history',{exact:true});await history.getByText('You · Conditions and population · version 2',{exact:true}).waitFor();
  for(const width of [1365,390])for(const dark of [false,true]){await page.setViewportSize({width,height:900});await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.waitForFunction(()=>{const e=document.querySelector('[aria-label="Planning conversation history"]');return e&&e.scrollHeight-e.scrollTop-e.clientHeight<4;});await page.screenshot({path:directory+'/conversation-'+width+'-'+(dark?'dark':'light')+'.png',fullPage:true});}
  return {restored_entries:4,viewports:[1365,390],themes:['light','dark'],automatic_reload_calls:0};
 });
 await check('invalid model routing is retained and cannot masquerade as an earlier usable question',async()=>{
  await page.getByLabel('Ask the guide',{exact:true}).fill('SOFTWARE-FIXTURE-INVALID-INTERVIEW');await page.getByRole('button',{name:'Send question',exact:true}).click();await page.getByText(/AI turn retained: invalid-output/).waitFor();
  assert.equal(await page.getByLabel('Your answer',{exact:true}).count(),0);const state=await idea();assert.equal(state.runs.at(-1).status,'invalid-output');assert.equal(state.ready,false);assert.equal(state.packets.length,2);await writeFile(directory+'/retained-interview-state.json',JSON.stringify(state,null,2)+'\n');return {invalid_preserved:true,stale_question_not_revived:true,approval:false};
 });
 await check('older backend rejects conversational calls before invocation and checklist remains usable',async()=>{
  const before=(await idea()).runs.length;await page.route('**/idea-model',async route=>{if(route.request().postDataJSON().action==='capabilities'){await route.fulfill({json:{research_ideas:{version:'research-ideas-v1'}}});return;}throw new Error('Older backend should not receive an interview invocation');});
  await page.getByRole('button',{name:'Continue conversation',exact:true}).click();await page.getByText(/The conversational guide is not available on this AI service yet/).waitFor();assert.equal((await idea()).runs.length,before);await page.getByRole('button',{name:'Use checklist instead',exact:true}).click();await page.getByRole('heading',{name:'Why does this question matter?',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Send answer',exact:true}).count(),0);assert.ok(await page.getByRole('button',{name:'Save answer and continue',exact:true}).isDisabled());await page.unroute('**/idea-model');return {extra_model_attempts:0,checklist_available:true};
 });
 return studyId;
}
