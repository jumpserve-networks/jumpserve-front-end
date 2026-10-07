import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

// Purpose-specific public production verifier: no tokens, write actions or arbitrary origins.
const origin='https://jumpserve.quaint-lab.org', path='/module/research-verification';
const stamp=new Date().toISOString().replaceAll(':','-');
const directory='.test-artifacts/research-production/'+stamp;await mkdir(directory,{recursive:true});
const preparationRelease=process.argv.slice(2).length===1&&process.argv[2]==='--preparation';
if(process.argv.slice(2).length&&!preparationRelease)throw new Error('Only --preparation is supported.');
const report={version:1,started_at:new Date().toISOString(),origin,protocol:'research-workflow-release-protocol-v1',amendment:'research-workflow-release-amendment-v2',reviewer:{identity:'Primary Codex AI implementer',type:'AI',independence:'Not independent'},design:'Public production release regressions; synthetic queue example remains explicitly instructional.',checks:[],errors:[],browser_errors:[],conditional_gaps:['No legitimate Google session; owner writes, cross-owner requests and provider round trip are unverified','Generic completed-study production chart/export awaits a genuine reviewed publication; completed/missing/invalid charts and exports have isolated fixture evidence'],measured_charges_usd:null,model_usage:null};
let browser;
if(preparationRelease){report.protocol='research-preparation-production-protocol-v1';report.design='Public preparation production regressions; no authenticated browser session or new scientific assessment.';}
async function check(name,action){const tick=Date.now();try{const evidence=await action();report.checks.push({name,passed:true,evidence,wall_seconds:(Date.now()-tick)/1000});console.log('PASS '+name);}catch(error){report.errors.push({name,reason:error.message});throw error;}}
try{
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 browser=await chromium.launch({headless:true,executablePath:existsSync(chrome)?chrome:undefined});
 const context=await browser.newContext({viewport:{width:1365,height:900},colorScheme:'light'});const page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',error=>report.browser_errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')report.browser_errors.push(message.text());});
 async function visit(suffix){const response=await page.goto(origin+path+suffix,{waitUntil:'domcontentloaded',timeout:30000});assert.equal(response.status(),200);assert.ok(!(await page.locator('body').innerText()).includes('Application error:'));}
 async function select(label,text){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:text,exact:true}).click();}
 await check('production navigation and meaningful empty publication state',async()=>{
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator(`a[href="${path}"]`).first().waitFor();
  await visit('');await page.locator(`a[href="${path}/new-study"]`).first().waitFor();
  await visit('/test-results');await page.getByRole('heading',{name:'No published assessments yet',exact:true}).waitFor();assert.match(await page.locator('main').innerText(),/Private drafts and planned experiments are not completed studies/);
  await page.screenshot({path:directory+'/desktop-empty-results.png',fullPage:true});return {published_studies:0,empty_is_not_zero_claims:true};
 });
 if(preparationRelease)await check('deployed preparation navigation and explicit draft guidance',async()=>{
  await visit('/methods');await page.locator(`a[href="${path}/new-study"]`).filter({hasText:'Assess a Paper'}).first().waitFor();
  await page.getByText('Explore an illustrative claim queue',{exact:true}).click();
  await select('Queue example state','New study awaiting preparation');
  const example=page.getByTestId('queue-example');assert.match(await example.innerText(),/Prepare paper and queue checks/);assert.match(await example.innerText(),/source-grounded plan/);assert.match(await example.innerText(),/No jobs queued/);
  await example.screenshot({path:directory+'/new-study-preparation-guidance.png'});
  await select('Queue example state','Mixed work and blocked prerequisites');await page.getByText('Explore an illustrative claim queue',{exact:true}).click();
  return {navigation:'Assess a Paper',draft_guidance:'Source-grounded preparation required; no jobs fabricated',google_owner_request:'Conditional; no legitimate session'};
 });
 await check('deployed methods queue example separate scientific and execution states',async()=>{
  await visit('/methods');await page.getByText('Explore an illustrative claim queue',{exact:true}).click();const queue=page.getByTestId('claim-queue');await queue.waitFor();
  assert.match(await page.getByTestId('queue-example').innerText(),/Synthetic teaching example/);assert.equal(await queue.locator('tbody tr').count(),6);assert.equal(await queue.locator('article').count(),5);assert.equal(await queue.locator('tbody tr').filter({hasText:'Untested'}).count(),6);
  await queue.getByText(/Recorded event history/).click();const pending=page.waitForEvent('download');await queue.getByRole('button',{name:'Download private queue history',exact:true}).click();const download=await pending;const bytes=await readFile(await download.path());const data=JSON.parse(bytes);assert.equal(data.coverage.jobs,5);assert.equal(data.coverage.events,5);
  await writeFile(directory+'/teaching-queue-download.json',bytes);await page.screenshot({path:directory+'/desktop-methods.png',fullPage:true});return {claims:6,jobs:5,origin:'Synthetic teaching example; no live owner queue',download_sha256:createHash('sha256').update(bytes).digest('hex')};
 });
 await check('desktop and mobile themes navigation bounded layout and empty/unavailable examples',async()=>{
  for(const viewport of [{width:1365,height:900},{width:390,height:844}]){
   await page.setViewportSize(viewport);
   for(const theme of ['Light Mode','Dark Mode']){
    if(viewport.width<600)await page.getByRole('button',{name:'Open module menu',exact:true}).click();
    await select('Theme',theme);
    if(viewport.width<600){await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('[data-slot="sheet-content"]').waitFor({state:'hidden'});}
    await page.waitForFunction(dark=>document.documentElement.classList.contains('dark')===dark,theme==='Dark Mode');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.getByTestId('queue-example').screenshot({path:directory+`/queue-${viewport.width}-${theme==='Dark Mode'?'dark':'light'}.png`});
   }
  }
  await select('Queue example state','Claims with no queued jobs');assert.match(await page.getByTestId('claim-queue').innerText(),/No jobs queued/);
  await select('Queue example state','Queue unavailable');assert.equal(await page.getByTestId('claim-queue').count(),0);assert.match(await page.getByTestId('queue-example').getByRole('alert').innerText(),/unknown/);
  return {viewports:['1365x900','390x844'],themes:['light','dark'],queue_states:['mixed','empty','unavailable'],body_horizontal_overflow:false};
 });
 await check('production missing study and export do not fabricate results',async()=>{
  const missing='9fe82c67-2a99-49b9-8bfc-670b69ab1944';await visit('/studies/'+missing);assert.match(await page.getByRole('status').innerText(),/no public assessment/);assert.equal(await page.locator('[aria-label="Current claim coverage"]').count(),0);
  const response=await fetch(origin+path+'/api/studies/'+missing+'/export');assert.equal(response.status,404);return {missing_study_html_status:200,missing_export_status:404,claim_coverage:'Unavailable, not zero'};
 });
 await check('sign-in return paths and existing completed IPv6 module remain available',async()=>{
  const suffixes=['/new-study','/workspace','/workspace/9fe82c67-2a99-49b9-8bfc-670b69ab1944?view=gaps'];
  if(preparationRelease)suffixes.push('/workspace/76c70fd9-0217-464e-8c26-0a47832409a3');
  for(const suffix of suffixes){
   await page.goto(origin+path+suffix,{waitUntil:'domcontentloaded'});const url=new URL(page.url());assert.equal(url.pathname,'/login');assert.equal(url.searchParams.get('next'),path+suffix);
  }
  const response=await page.goto(origin+'/module/ipv6-dns-study/test-results',{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);await page.getByRole('heading',{name:'DNS over IPv6: results and evidence limits',exact:true}).waitFor();assert.ok(!(await page.locator('main').innerText()).includes('Study data is unavailable.'));await page.screenshot({path:directory+'/existing-ipv6-mobile.png',fullPage:true});
  return {return_paths:suffixes.length,google_provider_and_owner_actions:'Conditional; no authenticated session',existing_ipv6_results:'Available; scientific coverage unchanged'};
 });
 assert.deepEqual(report.browser_errors,[]);
}catch(error){if(!report.errors.some(item=>item.reason===error.message))report.errors.push({name:'browser setup or runtime',reason:error.message});}
finally{if(browser)await browser.close();report.ended_at=new Date().toISOString();report.passed=!report.errors.length&&!report.browser_errors.length;await writeFile(directory+'/browser-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;}
