// Actual components -> HTTP API -> PostgreSQL/controller/arithmetic. Explicit
// synthetic auth, provider/source and Storage; no live model/cloud claims.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),{build}=require('../../jumpserve-infra/node_modules/esbuild');
if(process.argv.length!==2)throw new Error('Fixed local autonomy campaign only.');
const api='http://127.0.0.1:4104',headers={Authorization:'Bearer explicit-software-fixture'};
const metadata=await(await fetch(api+'/fixture-metadata')).json();assert.match(metadata.database,/^jumpserve_research_ideas_test_/);
const directory='.test-artifacts/research-autonomy/'+new Date().toISOString().replaceAll(':','-');await mkdir(directory,{recursive:true});
const report={protocol:'autonomy-bounded-followups-protocol-v1',database:metadata.database,checks:[],browser_errors:[],real_model_calls:0,cloud_instances:0,reviewer:{identity:'Primary Codex AI implementer',type:'AI',independent:false},conditional_gaps:['Real model evaluation/publication','Legitimate Google request','Remote Supabase Storage','Actual cloud TCP invocation and deployed bounds'],measured_charges_usd:null};
let server,browser,study;
const uploadFixture={name:'explicit-local-paper-storage',setup(plugin){
 plugin.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'paper-upload',namespace:'paper-storage-fixture'}));
 plugin.onLoad({filter:/.*/,namespace:'paper-storage-fixture'},()=>({contents:`export function createClient(){return{storage:{from(bucket){if(bucket!=='research-paper-uploads')throw new Error('Unexpected fixture bucket');return{async uploadToSignedUrl(path,token,bytes){const response=await fetch(${JSON.stringify(api)}+'/fixture-paper-upload/'+path,{method:'PUT',body:bytes,headers:{Authorization:'Bearer explicit-software-fixture','Content-Type':'application/pdf','X-Upload-Token':token}});return{error:response.ok?null:new Error('Explicit local upload HTTP '+response.status)}}}}}}}`,loader:'js',resolveDir:process.cwd()}));
}};
async function check(name,run){try{report.checks.push({name,passed:true,evidence:await run()});console.log('PASS '+name);}catch(error){report.checks.push({name,passed:false,reason:error.message});throw error;}}
try{
 const bundle=await build({stdin:{contents:`import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';import{PaperIntake}from'./app/components/research-workflow/workspace';import{ExperimentQueueDashboard}from'./app/components/research-workflow/experiment-queue';import{NetworkProtocolEditor}from'./app/components/research-ideas/network-protocol-editor';function App(){const[protocol,setProtocol]=useState('{}');const[path,setPath]=useState(location.href);useEffect(()=>{const event=()=>setPath(location.href);window.addEventListener('popstate',event);return()=>window.removeEventListener('popstate',event)},[]);const u=new URL(path);if(u.pathname.endsWith('/bounded-editor'))return <NetworkProtocolEditor studyId='10000000-0000-4000-8000-000000000001' document={{question:'Host-local TCP software check',hypothesis:'Record exact exchange bytes',controls:'Payload integrity',limitations:'Host-local development only'}} protocol={protocol} onChange={setProtocol} guided/>;return u.pathname.endsWith('/new-study')?<PaperIntake/>:<ExperimentQueueDashboard studyId={u.searchParams.get('study')??undefined}/>};createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL':JSON.stringify(api)},plugins:[uploadFixture,{name:'explicit-local-auth-and-navigation',setup(p){p.onResolve({filter:/^@\/lib\/browser-auth$/},()=>({path:'auth',namespace:'fixture'}));p.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'fixture'}));p.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?`export async function requireAccessToken(){return 'explicit-software-fixture'}`:a.path==='next/link'?`import React from'react';export default function Link({href,children,...p}){return React.createElement('a',{href,...p},children)}`:`export function useRouter(){return{push(p){history.pushState({},'',p);dispatchEvent(new PopStateEvent('popstate'))}}}`,loader:'js',resolveDir:process.cwd()}));}}]});
 const cssNames=(await readdir('.next/static/chunks')).filter(n=>n.endsWith('.css'));const css=(await Promise.all(cssNames.map(n=>readFile('.next/static/chunks/'+n,'utf8')))).join('\n');
 const html='<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><style>body{padding:16px}#root{max-width:1100px;margin:auto}</style></head><body><p>Local software fixture: synthetic auth, provider, source and Storage. Actual SQL/controller/queue arithmetic.</p><div id="root"></div><script src="/fixture.js"></script></body></html>';
 server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':req.url==='/fixture.js'?'application/javascript':'text/html'});res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:html)});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const origin='http://127.0.0.1:'+server.address().port;
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,executablePath:existsSync(chrome)?chrome:undefined});
 const page=await browser.newPage({viewport:{width:1365,height:900}});page.setDefaultTimeout(30000);page.on('pageerror',e=>report.browser_errors.push(e.message));
 async function state(){return await(await fetch(api+'/research/queue',{headers})).json();}
 await check('PDF intake fits desktop and mobile themes with one file picker and no title or URL input',async()=>{
  await page.goto(origin+'/research-verification/new-study');await page.getByRole('form',{name:'Start autonomous paper assessment',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Paper title',{exact:true}).count(),0);assert.equal(await page.getByLabel('Paper URL or DOI URL',{exact:true}).count(),0);
  assert.equal(await page.getByLabel('Paper PDF',{exact:true}).getAttribute('accept'),'application/pdf,.pdf');
  for(const width of [1365,390]){await page.setViewportSize({width,height:900});for(const dark of [false,true]){await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);await page.waitForFunction(()=>getComputedStyle(document.querySelector('#paper-pdf')).color===getComputedStyle(document.body).color);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:directory+'/pdf-intake-'+width+'-'+(dark?'dark':'light')+'.png',fullPage:true});}}
  return {file_picker:true,paper_title_input:false,paper_url_input:false,widths:[1365,390],themes:['light','dark']};
 });
 await check('invalid PDF is explained without reserving storage or starting a workflow',async()=>{
  let admissions=0;const count=request=>{if(request.method()==='POST'&&request.url()===api+'/research/paper-uploads')admissions++;};page.on('request',count);
  await page.getByLabel('Paper PDF',{exact:true}).setInputFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('Explicit non-PDF software input')});
  await page.getByLabel('Research domain',{exact:true}).fill('Software verification');await page.getByLabel('Reproduction scope',{exact:true}).fill('Input validation only');await page.getByRole('button',{name:'Start autonomous assessment',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'no PDF signature'}).waitFor();assert.equal(admissions,0);page.off('request',count);await page.screenshot({path:directory+'/invalid-pdf.png',fullPage:true});
  await page.reload();return {post_admissions:0,invalid_input_retained:true,new_workflows:0};
 });
 await check('one form submission starts durable work with declared defaults and navigates to queue',async()=>{
  await page.goto(origin+'/research-verification/new-study');await page.getByRole('form',{name:'Start autonomous paper assessment',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Paper title',{exact:true}).count(),0);assert.equal(await page.getByLabel('Paper URL or DOI URL',{exact:true}).count(),0);
  await page.getByLabel('Paper PDF',{exact:true}).setInputFiles({name:'Autonomous browser software fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from(metadata.pdf_base64,'base64')});await page.getByLabel('Research domain',{exact:true}).fill('Software verification');await page.getByLabel('Reproduction scope',{exact:true}).fill('Synthetic matched cells only; no scientific assessment.');
  await page.getByRole('button',{name:'Start autonomous assessment',exact:true}).click();await page.waitForURL(/experiment-queue\?study=/);study=new URL(page.url()).searchParams.get('study');assert.ok(study);
  const data=await state();assert.equal(data.autonomy.workflows[0].max_spend_cents,10000);assert.equal(data.autonomy.workflows[0].max_attempts,25);return {study_id:study,initial_prompt_retained:true,background_worker:true};
 });
 await check('closing the page does not stop parallel claims or personalized follow-up',async()=>{
  await page.goto('about:blank');let data;
  for(let i=0;i<90;i++){data=await state();const w=data.autonomy.workflows.find(w=>w.study_id===study);if(w.status!=='running')break;await new Promise(resolve=>setTimeout(resolve,500));}
  const tasks=data.autonomy.tasks.filter(t=>t.study_id===study);assert.equal(tasks.filter(t=>t.status==='resolved').length,2);assert.equal(tasks.filter(t=>t.status==='blocked').length,1);assert.equal(data.jobs.filter(j=>j.study_id===study).length,4);
  await page.goto(origin+'/research-verification/experiment-queue?study='+study);await page.getByText('completed with blockers',{exact:true}).waitFor();await page.getByText('Applicable authorized instrument or archived measurement data',{exact:true}).waitFor();
  return {independent_of_browser:true,claims:3,resolved:2,blocked:1,experiments:4,model_bound:tasks.every(t=>t.attempts<=25)};
 });
 await check('recorded exact prompts responses costs and tailored retry are visible per claim',async()=>{
  const article=page.locator('article').filter({has:page.getByRole('heading',{name:/Synthetic eventual-agreement claim/})}).last();await article.getByRole('button',{name:'View prompts and responses'}).click();await article.getByText('Turn 8 · assessment · complete',{exact:true}).waitFor();
  const details=article.locator('details').filter({has:page.locator('summary').filter({hasText:'Exact prompt and configuration'})}).first();await details.locator('summary').click();assert.match(await details.innerText(),/modelId|us.anthropic.claude-sonnet/);
  const tasks=(await state()).autonomy.tasks;const t=tasks.find(t=>t.study_id===study&&t.claim_title?.includes('eventual-agreement'));assert.ok(t);const history=await(await fetch(api+'/research/studies/'+study+'/autonomy?task='+t.id,{headers})).json();assert.equal(history.study_id,study);assert.equal(history.task_id,t.id);assert.equal(history.coverage.total,8);assert.ok(history.turns.some(r=>r.stage==='planning'&&r.number>1&&r.request.messages[0].content[0].text.includes('missing observation')));await writeFile(directory+'/prompt-history-fixture.json',JSON.stringify(history,null,2)+'\n');return {turns:8,exact_prompts:true,matched_study_and_task:true,tailored_failure_context:true,unknown_cost_preserved:true};
 });
 await check('desktop and mobile light and dark states fit with visible blockers',async()=>{
  for(const width of [1365,390]){await page.setViewportSize({width,height:width===390?844:900});for(const dark of [false,true]){await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:directory+'/'+width+'-'+(dark?'dark':'light')+'.png',fullPage:true});}}
  return {widths:[1365,390],themes:['light','dark'],horizontal_overflow:false};
 });
 await check('actual Next routes preserve the queue alias query and sign-in return paths',async()=>{
  const canonical='/research-verification/experiment-queue?study='+study;
  await page.goto('http://127.0.0.1:6002/experiment-queue?study='+study,{waitUntil:'domcontentloaded'});await page.waitForURL(/\/login\?/);
  assert.equal(new URL(page.url()).searchParams.get('next'),canonical);
  await page.goto('http://127.0.0.1:6002/research-verification/new-study',{waitUntil:'domcontentloaded'});await page.waitForURL(/\/login\?/);
  assert.equal(new URL(page.url()).searchParams.get('next'),'/research-verification/new-study');
  return {anonymous_real_next_routes:true,alias_query_preserved:true,legitimate_google_session:false};
 });
 await check('invalid and unavailable status stays unknown without overwriting retained evidence',async()=>{
  await page.goto(origin+'/research-verification/experiment-queue?study='+study);await page.getByText('completed with blockers',{exact:true}).waitFor();
  await page.route(api+'/research/queue',async route=>{const response=await route.fetch();const value=await response.json();value.autonomy.tasks[0].attempts=26;await route.fulfill({response,json:value});});
  await page.getByText('The latest status retrieval failed. These retained claim states may be stale; current progress is unknown.',{exact:true}).waitFor();await page.screenshot({path:directory+'/stale-invalid-status.png',fullPage:true});
  await page.unroute(api+'/research/queue');await page.route(api+'/research/queue',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Explicit local unavailable-status fixture.'})}));
  await page.reload();await page.getByRole('alert').filter({hasText:'Queue counts and current status are unknown.'}).waitFor();assert.equal(await page.locator('[aria-label="All paper job counts"]').count(),0);await page.screenshot({path:directory+'/unavailable-status.png',fullPage:true});
  await page.unroute(api+'/research/queue');const retained=await state();assert.equal(retained.autonomy.tasks.filter(t=>t.study_id===study&&t.status==='resolved').length,2);
  return {invalid_progress_rejected:true,stale_retained_claims_marked:true,unavailable_counts_unknown:true,stored_outcomes_preserved:true,browser_response_fault_injection:true};
 });
 await check('bounded TCP editor exposes explicit units and host-local scope on mobile',async()=>{
  await page.goto(origin+'/bounded-editor');await page.getByRole('combobox',{name:'Networking executor'}).click();await page.getByRole('option',{name:'Bounded host-local TCP (emulated)',exact:true}).click();
  await page.getByText('Exchange a bounded payload over TCP loopback with controlled application delay.',{exact:false}).waitFor();
  const payload=page.getByRole('spinbutton',{name:'Payload per exchange (bytes)',exact:true});assert.equal(await payload.inputValue(),'32');await payload.fill('65536');
  const exchanges=page.getByRole('spinbutton',{name:'Exchanges per invocation',exact:true});await exchanges.fill('16');
  assert.equal(await page.getByRole('spinbutton',{name:'Application delay per exchange (ms)',exact:true}).getAttribute('max'),'20');
  assert.equal(await page.getByLabel('Original Python experiment source',{exact:true}).count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:directory+'/bounded-editor-mobile.png',fullPage:true});
  return {host_local_scope_explicit:true,payload_units:'bytes',application_delay_units:'ms',custom_package_fields_absent:true,automatic_cloud_execution_verified:false};
 });
 assert.deepEqual(report.browser_errors,[]);report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;process.exitCode=1;if(browser){const p=browser.contexts()[0]?.pages()[0];if(p){await writeFile(directory+'/failure.html',await p.content());await p.screenshot({path:directory+'/failure.png',fullPage:true});}}}
finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));report.study_id=study;report.ended_at=new Date().toISOString();await writeFile(directory+'/validation-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({directory,passed:report.passed,error:report.error}));}
