// Development software checks: actual UI/agent/SQL, synthetic auth and provider.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
export async function sourceCases({page,metadata,api,headers,directory,check}) {
 let studyId;
 const bad='Bootstrap 100 repeats of the same deterministic input as independent samples to claim a population confidence interval.';
 const idea=async()=>await(await fetch(api+'/research/studies/'+studyId+'/idea',{headers})).json();
 await check('fresh review renders exact statistics rather than a model-authored field paraphrase',async()=>{
  await page.getByLabel('Idea title',{exact:true}).fill('Source-fidelity software fixture');await page.getByLabel('Research domain',{exact:true}).fill('Software verification');await page.getByLabel('Research question',{exact:true}).fill(metadata.packet.question);await page.getByRole('button',{name:'Create private idea workspace',exact:true}).click();await page.waitForURL(/\/ideas\//);studyId=page.url().split('/ideas/')[1];
  const initial=await idea(),document={...metadata.packet,protocol:{...metadata.packet.protocol,statistics:bad}};
  const saved=await fetch(api+'/research/studies/'+studyId+'/idea',{method:'POST',headers,body:JSON.stringify({action:'save',request_id:crypto.randomUUID(),supersedes_id:initial.current_packet_id,document,reason:'Declared source-fidelity software fixture'})});assert.equal(saved.status,200);
  await page.reload();await page.getByRole('button',{name:'Detailed editor and history',exact:true}).click();
  await page.getByRole('button',{name:'Request fresh critic review',exact:true}).click();await page.getByText(/^critic · failed$/i).waitFor();await page.getByRole('button',{name:'Request fresh critic review',exact:true}).click();await page.getByText(/^critic · complete · Clarification needed$/i).waitFor();
  await page.locator('summary:visible').filter({hasText:'Recorded declarations · plan version 2'}).click();assert.equal(await page.getByRole('region',{name:'Discuss the plan and challenge it',exact:true}).getByLabel('Original /protocol/statistics',{exact:true}).textContent(),bad);
  const state=await idea();const run=state.runs.find(r=>r.status==='complete');const evidence=run.provenance.tool_events[0].source_evidence;assert.equal(evidence.fields[0].value,bad);assert.equal(evidence.packet_sha256,state.packets.at(-1).sha256);assert.equal(state.ready,false);assert.ok(!run.output.summary.includes('statistics correctly'));
  return {study_id:studyId,model_provider:'synthetic software fixture',original_statistics_retained:true,failed_attempt_preserved:true,ready:false};
 });
 await check('the guided view exposes the same original declarations',async()=>{
  await page.getByRole('button',{name:'Guided conversation',exact:true}).click();const guide=page.getByRole('region',{name:'Guided experiment planning',exact:true});await guide.getByText('Recorded declarations · plan version 2',{exact:true}).click();assert.equal(await guide.getByLabel('Original /protocol/statistics',{exact:true}).textContent(),bad);return {guided_and_detailed_sources_match:true};
 });
 await check('altered evidence cannot masquerade as the saved source and refresh recovers the real declaration',async()=>{
  await page.getByText('History and results',{exact:true}).click();
  await page.route('**/research/studies/'+studyId+'/idea',async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch(),state=await response.json();const run=state.runs.find(r=>r.status==='complete');run.provenance.tool_events[0].source_evidence.fields[0].value='Statistics correctly disclaims independent samples.';await route.fulfill({response,json:state});});
  await page.getByRole('button',{name:'Refresh retained status',exact:true}).click();await page.getByRole('alert').filter({hasText:'Review source values differ'}).waitFor();const guide=page.getByRole('region',{name:'Guided experiment planning',exact:true});assert.equal(await guide.getByLabel('Original /protocol/statistics',{exact:true}).count(),0);assert.equal((await idea()).packets.at(-1).document.protocol.statistics,bad);
  await page.unroute('**/research/studies/'+studyId+'/idea');await page.getByRole('button',{name:'Refresh retained status',exact:true}).click();await guide.getByText('Recorded declarations · plan version 2',{exact:true}).click();assert.equal(await guide.getByLabel('Original /protocol/statistics',{exact:true}).textContent(),bad);return {tampered_response_origin:'deliberate browser interception',mismatch_visible:true,source_unchanged:true};
 });
 await check('source declarations remain readable on desktop/mobile and both themes without approving or launching',async()=>{
  for(const width of [1365,390])for(const dark of [false,true]){await page.setViewportSize({width,height:900});await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('region',{name:'Guided experiment planning',exact:true}).getByLabel('Original /protocol/statistics',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:directory+'/sources-'+width+'-'+(dark?'dark':'light')+'.png',fullPage:false});}
  const state=await idea();assert.equal(state.ready,false);assert.equal(state.campaigns.length,0);await writeFile(directory+'/retained-source-state.json',JSON.stringify(state,null,2)+'\n');return {viewports:[1365,390],themes:['light','dark'],campaigns:0,scientific_runs:0};
 });
 return studyId;
}
