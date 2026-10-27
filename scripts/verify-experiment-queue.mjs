// Protocol: docs/experiment-queue.md. Actual components, fixed software transport;
// actual local Next navigation separately. No legitimate session is simulated.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const { build } = require('../../jumpserve-infra/node_modules/esbuild');
const componentsOnly=process.argv.length===3&&process.argv[2]==='--components';
assert.ok(process.argv.length===2||componentsOnly, 'Fixed local verification only; optional --components subset, no arbitrary origins or commands.');
const directory = `.test-artifacts/experiment-queue/${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(directory, { recursive: true });
const report = { protocol:'experiment-queue-development-v2', started_at:new Date().toISOString(), checks:[], errors:[], browser_errors:[], reviewer:{identity:'Primary Codex implementer',type:'AI',independent:false}, conditional_gaps:['Legitimate Google-authenticated browser/API request','Remote Supabase Storage','Scheduled AWS execution'], model_usage:null, measured_charges_usd:null };
report.source_sha256={};for(const path of ['app/components/research-workflow/experiment-queue.tsx','app/components/research-workflow/assessment-experiment-queue.tsx','app/components/research-workflow/autonomous-assessments.tsx','lib/research-experiment-queue.ts','lib/research-queue-api.ts','scripts/verify-experiment-queue.mjs'])report.source_sha256[path]=createHash('sha256').update(await readFile(path)).digest('hex');
const ids={study:'11111111-1111-4111-8111-111111111111',other:'22222222-2222-4222-8222-222222222222',source:'33333333-3333-4333-8333-333333333333',gap:'44444444-4444-4444-8444-444444444444',campaign:'55555555-5555-4555-8555-555555555555',job:'66666666-6666-4666-8666-666666666666'};
const fixture = `
const ids=${JSON.stringify(ids)};
export const RESEARCH_SIGN_IN_REQUIRED='Sign in to run assessments or chat with the AI.';
export class ResearchRequestError extends Error {constructor(message,status){super(message);this.status=status;}}
let mode='normal',lostResponse=true,jobStatus='queued';const calls=[];let enqueued=false,manual=false,reads=0,legacyReads=0;
function job(id,study,status,title){return {id,study_id:study,campaign_id:ids.campaign,campaign_title:title,status,readiness:status==='queued'?'ready':status,execution_mode:status==='manual'?'manual':'automatic',priority:3,reason:status==='failed'?'Synthetic retained failure':'Software fixture progress; no scientific result.',blockers:status==='manual'?['Requires a domain operator.']:[],dependencies:[],exclusive_resources:[],followup_of:null,run_id:status==='failed'?ids.gap:null,run_status:null,definition_sha256:'a'.repeat(64),lease_until:status==='running'?'2026-10-18T00:00:00Z':null,created_at:'2026-10-17T00:00:00Z',updated_at:'2026-10-17T01:00:00Z'};}
function overview(){
 if(mode==='unavailable')throw new Error('Synthetic queue transport failure');
 let jobs=mode==='empty'?[]:[job(ids.source,ids.other,'manual','Synthetic operator task'),job(ids.gap,ids.other,'failed','Synthetic failed check')];
 if(enqueued&&mode!=='empty')jobs.push(job(ids.job,ids.study,manual?'manual':jobStatus,'Synthetic retained check'));
 let studies=[{id:ids.study,title:'Private follow-up',study_kind:'paper'},{id:ids.other,title:'Other paper',study_kind:'paper'}];
 let autonomy;
 if(mode==='grouped'){
  studies=[...studies.map(s=>({...s,title:'Repeated paper title'})),{id:ids.source,title:'Paper awaiting preparation',study_kind:'paper'}];
  const statuses=['queued','running','manual','awaiting-review','reviewed','failed','expired','cancelled'];
  jobs=studies.slice(0,2).flatMap((s,index)=>Array.from({length:23},(_,n)=>job((100+index*100+n).toString(16).padStart(8,'0')+'-4444-4444-8444-444444444444',s.id,statuses[n%statuses.length],'Synthetic grouped job '+index+'-'+n)));
  const stamp='2026-10-22T00:00:00Z';
  autonomy={version:'research-autonomy-v3',defaults:{maximum_spend_usd:100,elapsed_days:7,attempts_per_claim:null},enabled:true,workflows:studies.map(s=>({study_id:s.id,initial_prompt:'Synthetic initial request '+s.id,initial_sha256:'a'.repeat(64),max_spend_cents:10000,committed_cents:0,max_attempts:null,status:'running',reason:'Synthetic background assessment status',created_at:stamp,updated_at:stamp,deadline_at:'2026-10-29T00:00:00Z'})),tasks:studies.map((s,n)=>({id:(500+n).toString(16).padStart(8,'0')+'-4444-4444-8444-444444444444',study_id:s.id,claim_id:n===2?null:(700+n).toString(16).padStart(8,'0')+'-4444-4444-8444-444444444444',claim_title:n===2?null:'Candidate claim for '+s.id,stage:n===2?'intake':'planning',status:'queued',label:n===2?null:'untested',attempts:0,reason:'Synthetic claim scoped to '+s.id,required_inputs:[],next_at:stamp,created_at:stamp,updated_at:stamp})),coverage:{workflows:3,tasks:3}};
  if(window.fixtureReverseGroups)studies.reverse();
 }
 return {version:'research-queue-overview-v1',access:'owner-private',studies,jobs,workers_enabled:false,limits:{global_jobs:4,study_jobs:2,invocation_jobs:2,lease_seconds:600,automatic_retries:0},coverage:{studies:studies.length,jobs:mode==='invalid'?999:jobs.length},limitations:'Synthetic software fixture. No scientific assessments or new measurements.',...(autonomy?{autonomy}:{})};
}
export async function researchRequest(path,options={}){
 if(options.signal?.aborted)throw new Error('Aborted');
 if(!options.method){
  if(path==='/capabilities')return {queue:{version:'research-queue-v1',overview_version:window.fixtureLegacyBackend?undefined:'research-queue-overview-v1',workers_enabled:false,limits:{global_jobs:4,study_jobs:2,invocation_jobs:2,lease_seconds:600,automatic_retries:0}},preparation:{gap_queue_version:window.fixtureLegacyBackend?undefined:'research-gap-queue-v1'}};
  if(path==='/queue'||path.startsWith('/queue?title_study=')){if(window.fixtureLegacyBackend)throw new Error('Undeployed overview route must never be requested');reads++;return overview();}
  if(window.fixtureLegacyBackend&&path==='/studies?mine=1')return {access:'owner-drafts',studies:overview().studies};
  if(window.fixtureLegacyBackend&&path.startsWith('/studies/')){
   const study=path.split('/')[2],data=overview();
   if(path.endsWith('/queue')){legacyReads++;const jobs=data.jobs.filter(j=>j.study_id===study);return {version:'research-queue-v1',study_id:study,access:'owner-private',workers_enabled:data.workers_enabled,limits:data.limits,jobs,events:[],coverage:{jobs:jobs.length,events:0},limitations:'Legacy recorded study queue'};}
   const kinds=['sources','claims','protocols','configurations','campaigns','claim_checks','runs','published_values','measurements','summaries','assessments','gaps','reviews','publications'];const records=Object.fromEntries(kinds.map(k=>[k,[]]));const jobs=data.jobs.filter(j=>j.study_id===study);records.campaigns=[...new Map(jobs.map(j=>[j.campaign_id,{id:j.campaign_id,study_id:study,title:j.campaign_title}])).values()];return {study:data.studies.find(s=>s.id===study),access:'owner-draft',records,coverage:Object.fromEntries(kinds.map(k=>[k,records[k].length]))};
  }
  return {version:'research-gap-queue-v1',study_id:ids.source,gap_id:ids.gap,gap_sha256:'a'.repeat(64),plan_sha256:'b'.repeat(64),choices:mode==='unknown'?[]:[{key:'numeric',title:'Synthetic retained check',execution_mode:'automatic',experiment_type:'reanalysis',coverage_limits:'Archived cells only; no new network measurement.',dependencies:[]},...(window.fixtureSingleChoice?[]:[{key:'operator',title:'Synthetic operator follow-up',execution_mode:'manual',experiment_type:'source-review',coverage_limits:'Operator preparation; no experiment executed.',dependencies:[]}])],limitation:'Development fixture, never scientific validation.',unavailable_reason:mode==='unknown'?'No retained plan matches this exact source version.':null};
 }
 const body=JSON.parse(options.body);calls.push({path,body});
 if(body.action==='create-followup')return {version:'research-gap-queue-v1',study_id:ids.study};
 if(body.action==='prepare')return {prepared:{id:ids.campaign}};
 if(body.action==='enqueue'){enqueued=true;manual=body.key==='operator';if(lostResponse){lostResponse=false;throw new Error('Synthetic lost enqueue response');}return {version:'research-gap-queue-v1',study_id:ids.study,job_id:ids.job,queued_job_ids:[ids.job],complete:true,workers_enabled:false,limitation:'Software fixture only'};}
 throw new Error('Unsupported fixture mutation');
}
window.queueFixture={calls,reads:()=>reads,legacyReads:()=>legacyReads,state:()=>overview(),reverseGroups(){window.fixtureReverseGroups=true;},setMode(value){if(!['normal','empty','invalid','unavailable','unknown','grouped'].includes(value))throw new Error('Fixed modes only');mode=value;window.renderFixture(value);},advance(value){if(!['running','awaiting-review'].includes(value))throw new Error('Fixed statuses only');jobStatus=value;},setReadFailure(){mode='unavailable';}};
`;
let server,browser;
async function check(name,action){try{report.checks.push({name,passed:true,evidence:await action()});console.log('PASS '+name);}catch(error){report.errors.push({name,reason:error.message});throw error;}}
try {
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ExperimentQueueDashboard} from './app/components/research-workflow/experiment-queue';import {RunGapExperiment} from './app/components/research-workflow/run-gap-experiment';const root=createRoot(document.getElementById('root'));let fixtureRevision=0;window.renderFixture=mode=>root.render(React.createElement(ExperimentQueueDashboard,{key:mode+(++fixtureRevision),studyId:window.fixtureSelectedAssessment,jobId:window.fixtureFocusedJob,sourceAssessment:window.fixtureLegacyBackend?undefined:'${ids.source}',gapId:window.fixtureLegacyBackend?undefined:'${ids.gap}'}));window.renderRunFixture=launchId=>root.render(React.createElement(RunGapExperiment,{key:'run-'+(++fixtureRevision),studyId:'${ids.source}',gapId:'${ids.gap}',launchId}));window.renderFixture('normal');`,resolveDir:process.cwd(),sourcefile:'experiment-queue-browser-fixture.tsx',loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixed-component-transport',setup(plugin){plugin.onResolve({filter:/^@\/lib\/research-workflow-api$/},()=>({path:'transport',namespace:'fixture'}));plugin.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));plugin.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'fixture'}));plugin.onResolve({filter:/^@\/lib\/browser-auth$/},()=>({path:'auth',namespace:'fixture'}));plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='transport'?fixture:args.path==='router'?"export function useRouter(){return {push(path){window.fixtureNavigations=(window.fixtureNavigations??[]).concat(path)}};}":args.path==='auth'?"export async function requireAccessToken(message){if(window.fixtureSignedOut)throw new Error(message);return 'synthetic-component-token';}":"import React from 'react';export default function Link({prefetch:ignored,...props}){return React.createElement('a',props);}",loader:'js',resolveDir:process.cwd()}));}}]});
 const cssNames=(await readdir('.next/static/chunks')).filter(n=>n.endsWith('.css'));
 assert.ok(cssNames.length,'Build before component verification.');
 const css=(await Promise.all(cssNames.map(n=>readFile('.next/static/chunks/'+n,'utf8')))).join('\n');
 const html='<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><style>body{padding:20px}#root{max-width:1100px;margin:auto}</style></head><body><div id="root" data-module-theme="research-verification"></div><script src="/fixture.js"></script></body></html>';
 server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':req.url==='/fixture.js'?'application/javascript':'text/html'});res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:html);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined});
 const context=await browser.newContext({viewport:{width:1365,height:900}});
 await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.browser_errors.push(e.message));
 await page.clock.install();await page.goto(origin);await page.getByRole('button',{name:'Queue experiment',exact:true}).waitFor();
 async function select(label,option){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();}
 await check('preview does not write; lost enqueue response resumes the same selection',async()=>{
  assert.equal(await page.evaluate(()=>window.queueFixture.calls.length),0);
  await page.getByRole('button',{name:'Queue experiment',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Synthetic lost enqueue response'}).waitFor();
  await page.getByRole('button',{name:'Resume queueing',exact:true}).click();
  await page.getByRole('button',{name:'Job recorded',exact:true}).waitFor();
  await page.getByRole('article').filter({hasText:'Synthetic retained check'}).waitFor();
  const calls=await page.evaluate(()=>window.queueFixture.calls);
  assert.deepEqual(calls.map(c=>c.body.action),['create-followup','prepare','enqueue','create-followup','prepare','enqueue']);
  assert.equal(new Set(calls.map(c=>c.body.request_id)).size,1);
  assert.equal(await page.locator('article').filter({hasText:ids.job}).count(),1);
  assert.ok(await page.getByRole('button',{name:'Job recorded',exact:true}).isDisabled());
  return {write_attempts:6,request_identities:1,selected_jobs:1,original_assessments_changed:false,google_authenticated:false};
 });
 await check('polling shows recorded running then review states and retains stale data on failure',async()=>{
  await page.evaluate(()=>window.queueFixture.advance('running'));await page.clock.runFor(10100);
  await page.locator('article').filter({hasText:ids.job}).getByText('running',{exact:true}).first().waitFor();
  await page.evaluate(()=>window.queueFixture.advance('awaiting-review'));await page.clock.runFor(10100);
  await page.getByText('Awaiting evidence review',{exact:true}).waitFor();
  await page.evaluate(()=>window.queueFixture.setReadFailure());await page.clock.runFor(10100);
  await page.getByRole('alert').filter({hasText:'may be stale'}).waitFor();
  assert.equal(await page.locator('article').filter({hasText:ids.job}).count(),1);
  return {interval_ms:10000,statuses:['queued','running','awaiting-review'],stale_data_retained:true};
 });
 await check('filters expose manual tasks failed runs and missing run status without a status download control',async()=>{
  await page.evaluate(()=>window.queueFixture.setMode('normal'));await page.getByText('Your experiment status',{exact:true}).waitFor();
  await select('Filter queue by assessment','Other paper');assert.equal(await page.locator('article').count(),2);
  await select('Filter queue by status','failed');assert.equal(await page.locator('article').count(),1);
  assert.match(await page.locator('article').innerText(),/Synthetic retained failure/);assert.match(await page.locator('article').innerText(),/status unavailable/);
  assert.equal(await page.getByRole('button',{name:'Download queue status',exact:true}).count(),0);
  await select('Filter queue by status','Needs operator');assert.match(await page.locator('article').innerText(),/Requires a domain operator/);
  return {filtered_failed_jobs:1,missing_run_status:null,queue_status_download:false};
 });
 await check('actual queue component fits desktop and mobile in both themes',async()=>{
  await page.clock.resume();await select('Filter queue by assessment','All paper assessments');await select('Filter queue by status','All statuses');assert.equal(await page.locator('[aria-label="Queue a follow-up experiment"]').count(),1);assert.equal(await page.locator('[data-testid="experiment-queue-dashboard"]').count(),1);
  for(const width of [1365,390])for(const dark of [false,true]){await page.setViewportSize({width,height:width===390?844:900});await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:directory+`/queue-${width}-${dark?'dark':'light'}.png`,fullPage:true});}
  return {viewports:[1365,390],themes:['light','dark'],horizontal_overflow:false};
 });
 await check('assessment groups keep repeated titles claims and conserved job counts separate, including preparation without jobs',async()=>{
  await page.evaluate(()=>window.queueFixture.setMode('grouped'));await page.locator('[data-assessment-id]').nth(2).waitFor();
  const data=await page.evaluate(()=>window.queueFixture.state());assert.equal(data.studies.length,3);assert.equal(await page.locator('[data-assessment-id]').count(),3);
  for(const assessment of data.studies){
   const group=page.locator(`[data-assessment-id="${assessment.id}"]`);const jobs=data.jobs.filter(job=>job.study_id===assessment.id);
   assert.equal(await group.getByRole('heading',{level:3}).innerText(),assessment.title);assert.ok((await group.innerText()).includes('Assessment '+assessment.id));
   const claim=data.autonomy.tasks.find(task=>task.study_id===assessment.id);assert.equal(await group.locator('article[id^="claim-task-"]').count(),1);assert.equal(await group.locator('article[id^="claim-task-"]').getAttribute('id'),'claim-task-'+claim.id);
   const visible=await group.locator('article[id^="job-"]').evaluateAll(nodes=>nodes.map(node=>node.id.slice(4)));assert.equal(visible.length,Math.min(20,jobs.length));assert.ok(visible.every(id=>jobs.some(job=>job.id===id)));
   const counts=await group.locator('[aria-label="Assessment job counts"] > div').evaluateAll(nodes=>nodes.map(node=>({label:node.querySelector('p').textContent,value:Number(node.querySelector('p:last-child').textContent)})));
   assert.equal(counts.reduce((sum,count)=>sum+count.value,0),jobs.length);assert.equal(counts.find(count=>count.label==='Cancelled').value,jobs.filter(job=>job.status==='cancelled').length);
  }
  const preparation=page.locator(`[data-assessment-id="${ids.source}"]`);await preparation.getByText('Paper preparation and claim inventory',{exact:true}).waitFor();await preparation.getByRole('status').filter({hasText:'No experiment jobs have been recorded for this assessment yet'}).waitFor();
  assert.equal(await page.getByRole('heading',{level:3,name:'Repeated paper title',exact:true}).count(),2);
  for(const width of [1365,390])for(const dark of [false,true]){await page.setViewportSize({width,height:width===390?844:900});await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);await page.waitForFunction(()=>document.getAnimations().every(a=>!a.effect||!Number.isFinite(a.effect.getComputedTiming().endTime)||a.playState!=='running'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:directory+`/assessment-groups-${width}-${dark?'dark':'light'}.png`});}
  await preparation.screenshot({path:directory+'/preparation-without-jobs.png'});
  return {assessment_groups:3,repeated_titles_preserved_as_distinct:true,recorded_jobs:46,count_conservation:true,claim_identity_scoping:true,preparation_without_jobs_visible:true,viewports:[1365,390],themes:['light','dark']};
 });
 await check('assessment pagination and prompt expansion remain independent through filters and reordered polling',async()=>{
  const first=page.locator(`[data-assessment-id="${ids.study}"]`),second=page.locator(`[data-assessment-id="${ids.other}"]`);
  await first.getByRole('button',{name:'Show more jobs',exact:true}).click();assert.equal(await first.locator('article[id^="job-"]').count(),23);assert.equal(await second.locator('article[id^="job-"]').count(),20);
  await select('Filter queue by status','failed');assert.equal(await first.locator('article[id^="job-"]').count(),3);assert.equal(await second.locator('article[id^="job-"]').count(),3);assert.equal(await page.locator('[data-assessment-id]').count(),3);assert.equal(await page.locator('article[id^="claim-task-"]').count(),3);
  await select('Filter queue by status','All statuses');await first.getByText('Initial paper prompt',{exact:true}).click();assert.equal(await first.locator('details').getAttribute('open'),'');assert.equal(await second.locator('details').getAttribute('open'),null);
  await page.evaluate(()=>window.queueFixture.reverseGroups());await page.clock.runFor(10100);await page.waitForFunction(id=>document.querySelector('[data-assessment-id]')?.getAttribute('data-assessment-id')===id,ids.source);
  assert.equal(await first.locator('details').getAttribute('open'),'');assert.equal(await second.locator('details').getAttribute('open'),null);assert.equal(await first.locator('article[id^="job-"]').count(),23);assert.equal(await second.locator('article[id^="job-"]').count(),20);
  return {expanded_group_jobs:23,other_group_jobs:20,filtered_failed_jobs_per_assessment:3,preparation_group_retained_under_filter:true,poll_reordering_preserves_prompt_and_pagination_state:true};
 });
 await check('assessment selectors disambiguate repeated titles and a focused job stays in its owning assessment',async()=>{
  await select('Filter queue by assessment','Repeated paper title · '+ids.other);assert.equal(await page.locator('[data-assessment-id]').count(),1);assert.equal(await page.locator('[data-assessment-id]').getAttribute('data-assessment-id'),ids.other);
  const data=await page.evaluate(()=>window.queueFixture.state()),focus=data.jobs.filter(job=>job.study_id===ids.other).at(-1).id;
  await page.evaluate(({assessment,focus})=>{window.fixtureSelectedAssessment=assessment;window.fixtureFocusedJob=focus;window.renderFixture('focused');},{assessment:ids.other,focus});
  const group=page.locator(`[data-assessment-id="${ids.other}"]`);await group.locator('#job-'+focus).waitFor();assert.equal(await group.locator('article[id^="job-"]').first().getAttribute('id'),'job-'+focus);assert.equal(await page.locator('[data-assessment-id]').count(),1);assert.match(await group.locator('#job-'+focus).getAttribute('class'),/ring-primary/);
  await page.evaluate(()=>{window.fixtureSelectedAssessment=undefined;window.fixtureFocusedJob=undefined;window.fixtureReverseGroups=false;window.queueFixture.setMode('normal');});
  return {same_title_assessments_selected_by_id:true,focused_job_beyond_initial_page_visible:true,foreign_assessment_jobs:0};
 });
 await check('unsupported plans empty queues invalid coverage and unavailable status remain distinct',async()=>{
  await page.evaluate(()=>window.queueFixture.setMode('unknown'));await page.getByText('No retained plan matches this exact source version.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Queue experiment',exact:true}).count(),0);
  await page.evaluate(()=>window.queueFixture.setMode('empty'));await page.getByRole('status').filter({hasText:'No experiment jobs have been recorded for this assessment yet'}).first().waitFor();
  await page.evaluate(()=>window.queueFixture.setMode('invalid'));await page.getByRole('alert').filter({hasText:'coverage is incomplete'}).waitFor();assert.equal(await page.locator('[aria-label="Assessment job counts"]').count(),0);
  await page.evaluate(()=>window.queueFixture.setMode('unavailable'));await page.getByRole('alert').filter({hasText:'counts and current status are unknown'}).waitFor();
  return {states:['unsupported plan','empty','invalid','unavailable'],invalid_counts_rendered:false};
 });
 await check('run action writes without another confirmation; sign-in resume requires a saved same-tab click',async()=>{
  await page.evaluate(()=>{window.queueFixture.setMode('normal');window.fixtureSingleChoice=true;window.renderRunFixture();});
  await page.getByRole('button',{name:'Run experiment now',exact:true}).click();
  await page.waitForFunction(()=>window.fixtureNavigations?.some(p=>p.includes('experiment-queue?assessment=')));
  const before=await page.evaluate(()=>window.queueFixture.calls.length);
  await page.evaluate(id=>window.renderRunFixture(id),'77777777-7777-4777-8777-777777777777');
  await page.getByRole('button',{name:'Run experiment now',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.queueFixture.calls.length),before);
  await page.evaluate(()=>window.fixtureSignedOut=true);await page.getByRole('button',{name:'Run experiment now',exact:true}).click();
  await page.waitForFunction(()=>window.fixtureNavigations?.some(p=>p.startsWith('/login?')));
  const login=await page.evaluate(()=>window.fixtureNavigations.findLast(p=>p.startsWith('/login?')));
  const next=new URL(login,'https://example.org').searchParams.get('next');const launch=new URL(next,'https://example.org').searchParams.get('run');assert.ok(launch);
  assert.equal(await page.evaluate(()=>window.queueFixture.calls.length),before);
  await page.evaluate(id=>{window.fixtureSignedOut=false;window.renderRunFixture(id);},launch);
  await page.waitForFunction(count=>window.queueFixture.calls.length===count+3,before);
  return {confirmation_clicks:1,run_requests_after_simulated_return:3,untrusted_get_caused_writes:false,google_authenticated:false};
 });
 await check('older deployed API loads recorded queues without probing missing routes; unsupported launches explain the backend requirement',async()=>{
  const before=await page.evaluate(()=>window.queueFixture.reads());
  await page.evaluate(()=>{window.fixtureLegacyBackend=true;window.queueFixture.setMode('normal');});
  await page.getByText(/Read from existing owner assessment queues/).waitFor();
  assert.equal(await page.locator('article').count(),3);assert.equal(await page.getByRole('alert').count(),0);
  assert.equal(await page.evaluate(()=>window.queueFixture.reads()),before);assert.ok(await page.evaluate(()=>window.queueFixture.legacyReads())>=2);
  const writes=await page.evaluate(()=>window.queueFixture.calls.length);
  await page.evaluate(()=>window.renderRunFixture());await page.getByRole('button',{name:'Run experiment now',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'backend has not released'}).waitFor();assert.equal(await page.evaluate(()=>window.queueFixture.calls.length),writes);
  return {available_study_queues:2,jobs:3,unavailable_overview_requests:0,unsupported_launch_writes:0,authentication:'Synthetic component transport only'};
 });
 await writeFile(directory+'/component.html',await page.content());await context.close();
 if(componentsOnly)report.conditional_gaps.push('Local Next navigation omitted in the explicit component subset; verified separately by verify:research:public-queue.');
 if(!componentsOnly){
 const local=await browser.newContext({viewport:{width:1365,height:900}});const app=await local.newPage();app.setDefaultTimeout(20000);app.on('pageerror',e=>report.browser_errors.push(e.message));
 await check('local Next sidebar gap actions and exact sign-in return paths',async()=>{
  await app.goto('http://localhost:6001/research-verification/previous-assessments');
  const menu=app.locator('[data-slot="module-sidebar"]');assert.equal(await menu.getByRole('link',{name:'Experiment Queue',exact:true}).getAttribute('href'),'/research-verification/experiment-queue');
  await app.getByRole('link',{name:'Read assessment',exact:true}).first().click();
  const gapLink=app.getByRole('link',{name:'Evidence gaps & next experiments',exact:true}).first();await gapLink.click();
  await app.getByRole('heading',{name:'Evidence gaps and next experiments',exact:true}).waitFor();
  const action=app.getByRole('button',{name:'Run experiment now',exact:true}).first();await action.waitFor();const studyPath=new URL(app.url()).pathname;await action.click();
  await app.waitForURL('**/login?**');const pending=new URL(new URL(app.url()).searchParams.get('next'),'https://example.org');assert.equal(pending.pathname,'/research-verification/experiment-queue');assert.equal(pending.searchParams.get('sourceAssessment'),studyPath.split('/').at(-1));assert.ok(pending.searchParams.get('gap'));assert.ok(pending.searchParams.get('run'));
  const target='/research-verification/experiment-queue';await app.goto('http://localhost:6001'+target);assert.equal(new URL(app.url()).searchParams.get('next'),target);
  await app.setViewportSize({width:390,height:844});await app.goto('http://localhost:6001/research-verification');await app.getByRole('button',{name:'Open module menu',exact:true}).click();assert.ok(await app.getByRole('dialog').getByRole('link',{name:'Experiment Queue',exact:true}).isVisible());
  return {sidebar:true,mobile_menu:true,gap_identity_preserved:true,actual_login:false};
 });
 await local.close();
 }
 assert.deepEqual(report.browser_errors,[]);
} catch(error){if(!report.errors.some(e=>e.reason===error.message))report.errors.push({name:'setup/runtime',reason:error.message});}
finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));report.ended_at=new Date().toISOString();report.passed=report.errors.length===0&&report.browser_errors.length===0;await writeFile(directory+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({directory,passed:report.passed,checks:report.checks.length,errors:report.errors}));if(!report.passed)process.exitCode=1;}
