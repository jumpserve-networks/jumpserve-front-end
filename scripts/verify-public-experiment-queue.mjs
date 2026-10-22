// Fixed local campaign: actual Next page -> actual Python handler -> synthetic
// store records. No real login, database, models, experiment launches or writes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
assert.equal(process.argv.length,2,'Fixed local public queue campaign only.');
const origin='http://127.0.0.1:6103',study='11111111-1111-4111-8111-111111111111';
const target='/research-verification/experiment-queue?study='+study;
const directory='.test-artifacts/public-experiment-queue/'+new Date().toISOString().replaceAll(':','-');await mkdir(directory,{recursive:true});
const report={protocol:'public-experiment-queue-v1',started_at:new Date().toISOString(),checks:[],requests:[],browser_errors:[],source_sha256:{},reviewer:{identity:'Primary Codex AI implementer',type:'AI',independent:false},conditional_gaps:['Production anonymous status and deployed private API denials','Actual Supabase reads and RLS; store fixture is synthetic','Actual authenticated owner session'],new_model_calls:0,new_experiment_launches:0,measured_charges_usd:null};
for(const path of ['app/(modules)/research-verification/experiment-queue/page.tsx','app/components/research-workflow/public-experiment-queue.tsx','app/components/research-workflow/autonomous-assessments.tsx','lib/research-public-queue.ts','../jumpserve-back-end/research_workflow/api.py','../jumpserve-back-end/research_workflow/scheduler.py','../jumpserve-back-end/research_workflow/tests/public_queue_fixture.py','scripts/verify-public-experiment-queue.mjs'])report.source_sha256[path]=createHash('sha256').update(await readFile(path)).digest('hex');
let python,app,browser,pythonLog='',appLog='',fixtureOrigin;
async function check(name,action){try{report.checks.push({name,passed:true,evidence:await action()});console.log('PASS '+name);}catch(e){report.checks.push({name,passed:false,error:e.message});throw e;}}
async function fixtureMode(mode){const r=await fetch(fixtureOrigin+'/fixture/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})});assert.equal(r.status,200);}
try{
 python=spawn('python3',['-B','research_workflow/tests/public_queue_fixture.py'],{cwd:'../jumpserve-back-end',stdio:['ignore','pipe','pipe']});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Python fixture start timeout')),10000);python.once('error',reject);python.once('exit',code=>reject(Error('Python fixture exited '+code)));python.stderr.on('data',c=>{pythonLog+=c;});python.stdout.on('data',c=>{pythonLog+=c;const line=pythonLog.split('\n').find(l=>l.startsWith('{'));if(line){try{const data=JSON.parse(line);clearTimeout(timer);resolve(data);}catch{}}});});
 assert.equal(ready.fixture,'public-queue-synthetic-store-v1');fixtureOrigin='http://127.0.0.1:'+ready.port;
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','6103'],{stdio:['ignore','pipe','pipe']});app.stdout.on('data',c=>{appLog+=c;});app.stderr.on('data',c=>{appLog+=c;});
 let up=false;for(let i=0;i<80;i++){if(app.exitCode!==null)throw Error('Next start failed: '+appLog);try{const r=await fetch(origin+'/icon.png');if(r.ok){up=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(up,'Built Next server did not start');
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,executablePath:existsSync(chrome)?chrome:undefined});
 const context=await browser.newContext({viewport:{width:1365,height:900}});
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
  if(u.pathname.startsWith('/research/studies/')&&u.pathname.endsWith('/queue')&&u.search==='?public=1'){
   const headers=await req.allHeaders();report.requests.push({path:u.pathname+u.search,method:req.method(),authorization_present:!!headers.authorization,cookie_present:!!headers.cookie});assert.equal(req.method(),'GET');assert.equal(headers.authorization,undefined);assert.equal(headers.cookie,undefined);
   const response=await fetch(fixtureOrigin+u.pathname+u.search);const raw=await response.text();assert.ok(!raw.includes('PRIVATE-CANARY'));
   return route.fulfill({status:response.status,body:raw,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin,'Cache-Control':'no-store'}});
  }
  if(u.origin===origin)return route.continue();
  if(u.pathname.startsWith('/research/'))report.requests.push({unexpected_private_path:u.pathname});
  return route.abort();
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.browser_errors.push(e.message));await page.clock.install();
 await check('anonymous Next route reads actual API status without owner credentials or private controls',async()=>{
  const response=await page.goto(origin+target);assert.equal(response.status(),200);assert.equal(new URL(page.url()).pathname,'/research-verification/experiment-queue');
  await page.getByTestId('public-experiment-queue').getByText('Public paper title',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'View prompts and responses',exact:true}).count(),0);assert.equal(await page.getByText('Initial paper prompt',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Run experiment now',exact:true}).count(),0);
  const body=await page.locator('main').innerText();for(const label of ['untested','inconclusive','reproduced','discrepant'])assert.ok(body.includes('finding: '+label));
  assert.ok(body.includes('Paper preparation · 0 AI turns'));assert.ok(body.includes('Recorded run status: partial'));assert.ok(body.includes('Recorded run status: unavailable'));assert.ok(!body.includes('PRIVATE-CANARY'));
  return {anonymous:true,real_python_handler:true,synthetic_store:true,claim_labels:4,private_prompt_controls:0,private_bytes:false};
 });
 await check('serial polling updates actual recorded status and failed polls retain marked stale evidence',async()=>{
  await fixtureMode('running');await page.clock.runFor(10100);await page.getByRole('article').filter({hasText:'bbbbbbbb-1111-4111-8111-111111111111'}).getByText('running',{exact:true}).waitFor();
  await fixtureMode('unavailable');await page.clock.runFor(10100);await page.getByRole('alert').filter({hasText:'may be stale'}).waitFor();assert.equal(await page.locator('article[id^="job-"]').count(),2);await page.getByText(/retained claim states may be stale/).waitFor();
  return {poll_ms:10000,stale_jobs_retained:2,stale_claims_marked:true};
 });
 await fixtureMode('normal');await page.reload();await page.getByText('Public paper title',{exact:true}).waitFor();
 await check('status filtering and 1365/390 light/dark layouts preserve claims and missingness',async()=>{
  await page.getByRole('combobox',{name:'Filter queue by status',exact:true}).click();await page.getByRole('option',{name:'failed',exact:true}).click();assert.equal(await page.locator('article[id^="job-"]').count(),1);
  await page.getByRole('combobox',{name:'Filter queue by status',exact:true}).click();await page.getByRole('option',{name:'All statuses',exact:true}).click();
  for(const width of [1365,390])for(const theme of ['Light Mode','Dark Mode']){await page.setViewportSize({width,height:width===390?844:900});await page.getByRole('button',{name:theme,exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:directory+'/queue-'+width+'-'+theme.split(' ')[0].toLowerCase()+'.png',fullPage:true});}
  return {widths:[1365,390],themes:['light','dark'],overflow:false,filtered_jobs:1};
 });
 await check('empty initial invalid initial unavailable and missing-study states remain distinct',async()=>{
  await fixtureMode('empty');await page.reload();await page.getByRole('status').filter({hasText:'No experiment jobs have been recorded yet'}).waitFor();assert.equal(await page.locator('article[id^="claim-task-"]').count(),1);
  await fixtureMode('invalid');await page.reload();await page.getByRole('alert').filter({hasText:'coverage is invalid or incomplete'}).waitFor();assert.equal(await page.locator('article[id^="job-"]').count(),0);
  await fixtureMode('unavailable');await page.reload();await page.getByRole('alert').filter({hasText:'Queue counts and current status are unknown'}).waitFor();
  await fixtureMode('normal');await page.goto(origin+'/research-verification/experiment-queue?study=00000000-0000-4000-8000-000000000001');await page.getByRole('alert').filter({hasText:'paper queue is unavailable'}).waitFor();
  const before=report.requests.length;await page.goto(origin+'/research-verification/experiment-queue?study=invalid');await page.getByRole('alert').filter({hasText:'invalid study'}).waitFor();assert.equal(report.requests.length,before);
  return {states:['empty','invalid response','unavailable','missing paper','invalid ID'],failed_counts_not_zero:true};
 });
 await check('private queue action paths and base queue require sign-in while shared aliases preserve IDs',async()=>{
  for(const path of [target+'&view=private','/research-verification/experiment-queue','/research-verification/experiment-queue?sourceStudy='+study+'&gap=22222222-2222-4222-8222-222222222222']){await page.goto(origin+path);assert.equal(new URL(page.url()).pathname,'/login');assert.equal(new URL(page.url()).searchParams.get('next'),path);}
  await page.goto(origin+'/experiment-queue?study='+study);await page.getByText('Public paper title',{exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/research-verification/experiment-queue');assert.equal(new URL(page.url()).searchParams.get('study'),study);
  await page.getByRole('link',{name:'Open owner’s private queue',exact:true}).click();await page.waitForURL(/\/login\?/);assert.equal(new URL(page.url()).searchParams.get('next'),target+'&view=private');
  for(const suffix of ['/autonomy','/queue']){const r=await fetch(fixtureOrigin+'/research/studies/'+study+suffix);assert.equal(r.status,401);}
  return {private_return_paths:3,anonymous_private_API_denials:2,shared_alias_public:true};
 });
 assert.deepEqual(report.browser_errors,[]);assert.ok(report.requests.length);assert.ok(report.requests.every(r=>r.method==='GET'&&!r.authorization_present&&!r.cookie_present&&!r.unexpected_private_path));report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;process.exitCode=1;if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await writeFile(directory+'/failure.html',await page.content());await page.screenshot({path:directory+'/failure.png',fullPage:true});}}}
finally{if(browser)await browser.close();if(app)app.kill('SIGTERM');if(python)python.kill('SIGTERM');report.ended_at=new Date().toISOString();await writeFile(directory+'/python.log',pythonLog);await writeFile(directory+'/next.log',appLog);await writeFile(directory+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({directory,passed:report.passed,error:report.error}));}
