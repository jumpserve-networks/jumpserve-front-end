// Actual component + actual prepareAndQueue helper with a bounded synthetic
// transport. This is a development browser regression, never Google auth or
// remote API/Storage verification. The fixture cannot make network requests.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const {build}=require('../../jumpserve-infra/node_modules/esbuild');
const directory='.test-artifacts/research-preparation';await mkdir(directory,{recursive:true});
const stamp=new Date().toISOString().replaceAll(':','-');
const report={protocol:'research-preparation-protocol-v1',started_at:new Date().toISOString(),design:'Exposed development component regression; actual React component and queue helper, synthetic bounded transport. No Google session, database, production request or scientific validation.',reviewer:{identity:'Primary Codex implementer',type:'AI',independence:'Not independent'},checks:[],errors:[],browser_errors:[],measured_charges_usd:null,model_usage:null};
const fixture=`
const calls=[];let jobs=[],failure=true,mode='available';
const definitions=[{id:'a',campaign_id:'ca',title:'Synthetic archived check',execution_mode:'automatic',status:'not-queued'},{id:'b',campaign_id:'cb',title:'Synthetic operator task',execution_mode:'manual',status:'not-queued'}];
function plan(){return {id:'p',plan_id:'software-fixture-v1',manifest_sha256:'a'.repeat(64),jobs:structuredClone(jobs),planned_jobs:2,queued_jobs:jobs.filter(j=>j.status!=='not-queued').length,automatic_jobs:1,manual_jobs:1,status:'prepared',provenance:{limitations:'Software fixture; no paper claim or experiment.'}};}
function status(){return {version:'research-preparation-v1',available_plan:mode==='available'?{plan_id:'software-fixture-v1',title:'Synthetic preparation plan',claims:2,automatic_jobs:1,manual_jobs:1,provenance:{limitations:'Software fixture; no paper claim or experiment.'}}:null,prepared:jobs.length?[plan()]:[],uploaded_plan_bytes:250000,limitation:'Software regression only'};}
export async function researchRequest(path,options){
 if(options?.signal?.aborted)throw new Error('Aborted fixture read');
 if(!options?.method)return status();
 const body=JSON.parse(options.body);calls.push(body);
 if(body.action==='prepare'){if(body.plan_input)throw new Error('Synthetic schema rejection: source-grounded records are missing.');jobs=structuredClone(definitions);return {prepared:plan()};}
 if(body.action!=='enqueue'||body.prepared_id!=='p')throw new Error('Unsupported fixture operation');
 if(body.job_id==='b'&&failure){failure=false;throw new Error('Synthetic transport interruption');}
 const job=jobs.find(j=>j.id===body.job_id);if(!job)throw new Error('Unknown fixture job');job.status=job.execution_mode==='manual'?'manual':'queued';return {job:{...job,study_id:'fixture-'+mode}};
}
window.preparationFixture={calls,setMode(value){if(!['available','unknown'].includes(value))throw new Error('Fixed fixture modes only');mode=value;jobs=[];failure=true;window.renderFixture(value);}};
`;
let server,browser;
async function check(name,action){try{report.checks.push({name,passed:true,evidence:await action()});console.log('PASS '+name);}catch(error){report.checks.push({name,passed:false,reason:error.message});throw error;}}
try{
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {PaperPreparation} from './app/components/research-workflow/paper-preparation';const root=createRoot(document.getElementById('root'));window.renderFixture=mode=>root.render(React.createElement(PaperPreparation,{key:mode,studyId:'fixture-'+mode,onSaved:async()=>{window.savedCallbacks=(window.savedCallbacks??0)+1;}}));window.renderFixture('available');`,resolveDir:process.cwd(),sourcefile:'research-preparation-browser-fixture.tsx',loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixed-software-transport',setup(plugin){plugin.onResolve({filter:/^@\/lib\/research-workflow-api$/},()=>({path:'fixed-fixture',namespace:'test'}));plugin.onLoad({filter:/.*/,namespace:'test'},()=>({contents:fixture,loader:'js'}));}}]});
 const cssNames=(await readdir('.next/static/chunks')).filter(name=>name.endsWith('.css'));
 if(!cssNames.length)throw new Error('Build the frontend before component verification.');
 const css=(await Promise.all(cssNames.map(name=>readFile('.next/static/chunks/'+name,'utf8')))).join('\n');
 const html='<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style><style>body{padding:20px}#root{max-width:850px;margin:auto}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
 server=createServer((req,res)=>{if(req.url==='/fixture.js'){res.writeHead(200,{'Content-Type':'application/javascript'});res.end(bundle.outputFiles[0].text);}else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}else{res.writeHead(404);res.end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
 const origin='http://127.0.0.1:'+server.address().port;
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,executablePath:existsSync(chrome)?chrome:undefined});
 const context=await browser.newContext({viewport:{width:1365,height:900}});await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',error=>report.browser_errors.push(error.message));page.setDefaultTimeout(10000);
 await page.goto(origin);await page.getByText(/Synthetic preparation plan: 2 claims/).waitFor();
 await check('actual component preserves interrupted queue progress and resumes only missing jobs',async()=>{
  await page.getByRole('button',{name:'Prepare available checks and queue jobs',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Synthetic transport interruption'}).waitFor();
  await page.getByText(/software-fixture-v1 · 1 \/ 2 jobs preserved/).waitFor();
  await page.getByRole('button',{name:'Resume queueing this plan',exact:true}).click();
  await page.getByText(/software-fixture-v1 · 2 \/ 2 jobs preserved/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Resume queueing this plan',exact:true}).count(),0);
  const calls=await page.evaluate(()=>window.preparationFixture.calls);assert.deepEqual(calls.map(c=>c.action==='enqueue'?c.job_id:c.action),['prepare','a','b','b']);
  assert.match(await page.locator('body').innerText(),/Scientific review remains separate/);
  return {requests:['prepare','enqueue:a','enqueue:b failed','enqueue:b resumed'],job_definitions:2,automatic_runs_executed:0,google_authenticated:false};
 });
 await check('owner preparation controls fit desktop and mobile in both themes',async()=>{
  for(const width of [1365,390])for(const dark of [false,true]){await page.setViewportSize({width,height:width===390?844:900});await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:directory+'/'+stamp+'-component-'+width+'-'+(dark?'dark':'light')+'.png',fullPage:true});}
  return {viewports:[1365,390],themes:['light','dark'],source:'Actual component with software fixture data'};
 });
 await check('unknown paper and invalid uploads cannot silently start jobs',async()=>{
  await page.evaluate(()=>window.preparationFixture.setMode('unknown'));await page.getByText(/This paper needs a source-grounded preparation plan/).waitFor();
  assert.ok(await page.getByRole('button',{name:'Prepare available checks and queue jobs',exact:true}).isDisabled());
  await page.getByText('Upload a source-grounded preparation plan',{exact:true}).click();
  const upload=page.getByLabel('Preparation plan JSON');
  await upload.setInputFiles({name:'oversized.json',mimeType:'application/json',buffer:Buffer.alloc(250001,32)});await page.getByRole('alert').filter({hasText:'upload byte limit'}).waitFor();
  await upload.setInputFiles({name:'invalid-schema.json',mimeType:'application/json',buffer:Buffer.from('{"not-a-plan":true}\n')});
  await page.getByRole('button',{name:'Prepare uploaded plan and queue checks',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'source-grounded records are missing'}).waitFor();assert.equal(await page.locator('article').count(),0);
  const calls=await page.evaluate(()=>window.preparationFixture.calls);assert.equal(calls.at(-1).plan_input,'{"not-a-plan":true}\n');
  await page.screenshot({path:directory+'/'+stamp+'-unknown-paper-error.png',fullPage:true});
  return {missing_plan:'explicit',oversized_upload:'refused before transport',invalid_schema:'simulated backend refusal shown',invented_jobs:0};
 });
 assert.deepEqual(report.browser_errors,[]);report.passed=true;
}catch(error){report.passed=false;report.errors.push(error.message);process.exitCode=1;}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));report.ended_at=new Date().toISOString();await writeFile(directory+'/'+stamp+'-browser-report.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));}
