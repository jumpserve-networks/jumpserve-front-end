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
const target='/research-verification/experiment-queue?assessment='+study;
const paperTitle='Making Congestion Control Algorithms Insensitive to Underlying Propagation Delays';
const directory='.test-artifacts/public-experiment-queue/'+new Date().toISOString().replaceAll(':','-');await mkdir(directory,{recursive:true});
const report={protocol:'public-experiment-queue-v7',started_at:new Date().toISOString(),checks:[],requests:[],browser_errors:[],source_sha256:{},reviewer:{identity:'Primary Codex AI implementer',type:'AI',independent:false},conditional_gaps:['Production anonymous status and deployed private API denials','Actual Supabase reads and RLS; store fixture is synthetic','Actual authenticated owner session','Title extraction accuracy across arbitrary PDF layouts'],new_model_calls:0,new_experiment_launches:0,measured_charges_usd:null};
for(const path of ['app/(modules)/research-verification/new-assessment/page.tsx','app/(modules)/research-verification/new-study/page.tsx','app/components/public-landing-page.tsx','app/components/research-workflow/experiment-queue.tsx','app/components/research-workflow/published-studies.tsx','app/components/research-workflow/workspace.tsx','lib/research-pathways.ts','lib/auth.ts','lib/auth-redirect.ts','next.config.ts'])report.source_sha256[path]=createHash('sha256').update(await readFile(path)).digest('hex');
for(const path of ['app/(modules)/research-verification/experiment-queue/page.tsx','app/(modules)/research-verification/previous-assessments/page.tsx','app/components/research-workflow/previous-assessments.tsx','lib/research-paper-catalog.ts','lib/test-modules.ts','app/components/research-workflow/public-experiment-queue.tsx','app/components/research-workflow/autonomous-assessments.tsx','lib/research-public-queue.ts','../jumpserve-back-end/research_workflow/api.py','../jumpserve-back-end/research_workflow/paper_catalog.py','../jumpserve-back-end/research_workflow/scheduler.py','../jumpserve-back-end/research_workflow/paper_titles.py','../jumpserve-back-end/research_workflow/intake.py','../jumpserve-back-end/research_workflow/tests/public_queue_fixture.py','../jumpserve-back-end/research_workflow/tests/test_paper_titles.py','scripts/verify-public-experiment-queue.mjs'])report.source_sha256[path]=createHash('sha256').update(await readFile(path)).digest('hex');
for(const path of ['app/(modules)/research-verification/assessments/[assessmentId]/page.tsx','app/(modules)/research-verification/studies/[studyId]/page.tsx','app/(modules)/research-verification/api/assessments/[assessmentId]/export/route.ts','app/(modules)/research-verification/api/studies/[studyId]/export/route.ts','lib/research-export.ts','lib/research-experiment-queue.ts','lib/research-workflow-server.ts','app/components/research-workflow/study-panel.tsx'])report.source_sha256[path]=createHash('sha256').update(await readFile(path)).digest('hex');
for(const path of ['app/components/research-ideas/idea-workspace.tsx','app/components/research-ideas/network-protocol-editor.tsx','lib/network-execution.ts','lib/research-workflow.ts','lib/research-workflow-api.ts','lib/browser-auth.ts','app/components/research-workflow/claim-designer.tsx','app/components/research-workflow/claim-queue.tsx','app/components/research-workflow/evidence-methods.tsx','app/components/research-workflow/network-job-cancel.tsx','app/components/research-workflow/queue-example.tsx','app/components/research-workflow/run-gap-experiment.tsx'])report.source_sha256[path]=createHash('sha256').update(await readFile(path)).digest('hex');
report.source_sha256['app/components/research-workflow/assessment-experiment-queue.tsx']=createHash('sha256').update(await readFile('app/components/research-workflow/assessment-experiment-queue.tsx')).digest('hex');
for(const path of ['app/(modules)/research-verification/assessments/page.tsx','app/(modules)/research-verification/workspace/page.tsx','app/(modules)/research-verification/workspace/[studyId]/page.tsx'])report.source_sha256[path]=createHash('sha256').update(await readFile(path)).digest('hex');
let python,build,app,browser,pythonLog='',buildLog='',appLog='',fixtureOrigin;
async function check(name,action){try{report.checks.push({name,passed:true,evidence:await action()});console.log('PASS '+name);}catch(e){report.checks.push({name,passed:false,error:e.message});throw e;}}
async function fixtureMode(mode){const r=await fetch(fixtureOrigin+'/fixture/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})});assert.equal(r.status,200);}
async function settledTheme(page,theme){
 await page.waitForFunction(dark=>document.documentElement.classList.contains('dark')===dark,theme==='Dark Mode');
 await page.waitForFunction(()=>document.getAnimations().every(a=>!a.effect||!Number.isFinite(a.effect.getComputedTiming().endTime)||a.playState!=='running'));
 await page.evaluate(()=>window.scrollTo(0,0));
}
try{
 python=spawn('python3',['-B','research_workflow/tests/public_queue_fixture.py'],{cwd:'../jumpserve-back-end',stdio:['ignore','pipe','pipe']});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Python fixture start timeout')),10000);python.once('error',reject);python.once('exit',code=>reject(Error('Python fixture exited '+code)));python.stderr.on('data',c=>{pythonLog+=c;});python.stdout.on('data',c=>{pythonLog+=c;const line=pythonLog.split('\n').find(l=>l.startsWith('{'));if(line){try{const data=JSON.parse(line);clearTimeout(timer);resolve(data);}catch{}}});});
 assert.equal(ready.fixture,'public-queue-synthetic-store-v1');fixtureOrigin='http://127.0.0.1:'+ready.port;
 // Compile both server and browser reads against this loopback fixture. No
 // production API or Supabase credentials are needed by this campaign.
 build=spawn('npm',['run','build'],{env:{...process.env,NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL:fixtureOrigin,NEXT_PUBLIC_BENCHMARK_API_URL:fixtureOrigin,NEXT_PUBLIC_AGENT_URL:'',NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-no-credentials'},stdio:['ignore','pipe','pipe']});
 build.stdout.on('data',c=>{buildLog+=c;});build.stderr.on('data',c=>{buildLog+=c;});
 const buildCode=await new Promise((resolve,reject)=>{build.once('error',reject);build.once('exit',resolve);});assert.equal(buildCode,0,'Fixture production build failed; see build.log');report.fixture_build='passed';
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','6103'],{stdio:['ignore','pipe','pipe']});app.stdout.on('data',c=>{appLog+=c;});app.stderr.on('data',c=>{appLog+=c;});
 let up=false;for(let i=0;i<80;i++){if(app.exitCode!==null)throw Error('Next start failed: '+appLog);try{const r=await fetch(origin+'/icon.png');if(r.ok){up=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(up,'Built Next server did not start');
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,executablePath:existsSync(chrome)?chrome:undefined});
 const context=await browser.newContext({viewport:{width:1365,height:900}});
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
  if((u.pathname.startsWith('/research/studies/')&&u.pathname.endsWith('/queue')&&u.search==='?public=1')||u.pathname==='/research/papers'||/^\/research\/papers\/[a-f0-9-]+\/title$/.test(u.pathname)){
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
  await page.getByTestId('public-experiment-queue').getByText(paperTitle,{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'View prompts and responses',exact:true}).count(),0);assert.equal(await page.getByText('Initial paper prompt',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Run experiment now',exact:true}).count(),0);
  const body=await page.locator('main').innerText();for(const label of ['untested','inconclusive','reproduced','discrepant'])assert.ok(body.includes('finding: '+label));
  assert.ok(body.includes('Paper preparation · 0 AI turns'));assert.ok(body.includes('Recorded run status: partial'));assert.ok(body.includes('Recorded run status: unavailable'));assert.ok(!body.includes('PRIVATE-CANARY'));assert.ok(!body.includes('ProxyDelay_Nines_CameraReady'));
  return {anonymous:true,real_python_handler:true,synthetic_store:true,title_from_retained_first_page:paperTitle,filename_displayed:false,claim_labels:4,private_prompt_controls:0,private_bytes:false};
 });
 await check('serial polling updates actual recorded status and failed polls retain marked stale evidence',async()=>{
  await fixtureMode('running');await page.clock.runFor(10100);await page.getByRole('article').filter({hasText:'bbbbbbbb-1111-4111-8111-111111111111'}).getByText('running',{exact:true}).waitFor();
  await fixtureMode('unavailable');await page.clock.runFor(10100);await page.getByRole('alert').filter({hasText:'may be stale'}).waitFor();assert.equal(await page.locator('article[id^="job-"]').count(),2);await page.getByText(/retained claim states may be stale/).waitFor();
  return {poll_ms:10000,stale_jobs_retained:2,stale_claims_marked:true};
 });
 await fixtureMode('normal');await page.reload();await page.getByText(paperTitle,{exact:true}).waitFor();
 await check('status filtering and 1365/390 light/dark layouts preserve claims and missingness',async()=>{
  await page.getByRole('combobox',{name:'Filter queue by status',exact:true}).click();await page.getByRole('option',{name:'failed',exact:true}).click();assert.equal(await page.locator('article[id^="job-"]').count(),1);
  await page.getByRole('combobox',{name:'Filter queue by status',exact:true}).click();await page.getByRole('option',{name:'All statuses',exact:true}).click();
  for(const width of [1365,390])for(const theme of ['Light Mode','Dark Mode']){await page.setViewportSize({width,height:width===390?844:900});await page.getByRole('button',{name:theme,exact:true}).click();await settledTheme(page,theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:directory+'/queue-'+width+'-'+theme.split(' ')[0].toLowerCase()+'.png',fullPage:true});}
  return {widths:[1365,390],themes:['light','dark'],overflow:false,filtered_jobs:1};
 });
 await check('missing paper title preserves claim and experiment status without displaying the filename',async()=>{
  await fixtureMode('title-missing');await page.reload();await page.getByText('Paper title unavailable',{exact:true}).waitFor();
  assert.equal(await page.locator('article[id^="claim-task-"]').count(),5);assert.equal(await page.locator('article[id^="job-"]').count(),2);
  assert.ok(!(await page.locator('main').innerText()).includes('ProxyDelay_Nines_CameraReady'));
  return {title_missing:true,filename_displayed:false,claim_tasks:5,jobs:2};
 });
 await check('empty initial invalid initial unavailable and missing-study states remain distinct',async()=>{
  await fixtureMode('empty');await page.reload();await page.getByRole('status').filter({hasText:'No experiment jobs have been recorded yet'}).waitFor();assert.equal(await page.locator('article[id^="claim-task-"]').count(),1);
  await fixtureMode('invalid');await page.reload();await page.getByRole('alert').filter({hasText:'coverage is invalid or incomplete'}).waitFor();assert.equal(await page.locator('article[id^="job-"]').count(),0);
  await fixtureMode('unavailable');await page.reload();await page.getByRole('alert').filter({hasText:'Queue counts and current status are unknown'}).waitFor();
  await fixtureMode('normal');await page.goto(origin+'/research-verification/experiment-queue?assessment=00000000-0000-4000-8000-000000000001');await page.getByRole('alert').filter({hasText:'paper queue is unavailable'}).waitFor();
  const before=report.requests.length;await page.goto(origin+'/research-verification/experiment-queue?assessment=invalid');await page.getByRole('alert').filter({hasText:'invalid assessment'}).waitFor();assert.equal(report.requests.length,before);
  return {states:['empty','invalid response','unavailable','missing paper','invalid ID'],failed_counts_not_zero:true};
 });
 await check('private queue action paths and base queue require sign-in while shared aliases preserve IDs',async()=>{
  for(const path of [target+'&view=private','/research-verification/experiment-queue','/research-verification/experiment-queue?sourceAssessment='+study+'&gap=22222222-2222-4222-8222-222222222222']){await page.goto(origin+path);assert.equal(new URL(page.url()).pathname,'/login');assert.equal(new URL(page.url()).searchParams.get('next'),path);}
  await page.goto(origin+'/experiment-queue?assessment='+study);await page.getByText(paperTitle,{exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/research-verification/experiment-queue');assert.equal(new URL(page.url()).searchParams.get('assessment'),study);
  await page.getByRole('link',{name:'Open owner’s private queue',exact:true}).click();await page.waitForURL(/\/login\?/);assert.equal(new URL(page.url()).searchParams.get('next'),target+'&view=private');
  for(const suffix of ['/autonomy','/queue']){const r=await fetch(fixtureOrigin+'/research/studies/'+study+suffix);assert.equal(r.status,401);}
  return {private_return_paths:3,anonymous_private_API_denials:2,shared_alias_public:true};
 });
 await check('previous assessments include submitted running stopped and published papers with queue links',async()=>{
  await page.goto(origin+'/');await page.getByRole('link',{name:'View previous',exact:true}).click();await page.waitForURL(origin+'/research-verification/previous-assessments');
  await page.getByRole('heading',{name:'Previous Assessments',exact:true}).waitFor();await page.getByRole('link',{name:paperTitle,exact:true}).waitFor();
  assert.equal(await page.locator('article[data-paper-id]').count(),10);assert.equal(await page.getByRole('link',{name:'View experiment queue',exact:true}).count(),10);
  const body=await page.locator('main').innerText();for(const label of ['In progress','Cancelled','Spending limit reached','Finished with gaps','Time limit reached','Published assessment','Not published'])assert.ok(body.includes(label),label);
  assert.ok(!body.includes('PRIVATE-CANARY'));assert.ok(!body.includes('ProxyDelay_Nines_CameraReady'));
  await page.locator(`article[data-paper-id="${study}"]`).getByRole('link',{name:paperTitle,exact:true}).click();await page.waitForURL(origin+target);await page.getByText(paperTitle,{exact:true}).waitFor();
  return {first_page:10,unpublished_papers_visible:true,published_link_retained:true,private_bytes:false,queue_link_works:true};
 });
 await check('paper pagination reaches older submissions and legacy results routes preserve queries',async()=>{
  await page.goto(origin+'/research-verification/previous-assessments');await page.locator('article[data-paper-id]').first().waitFor();
  const first=await page.locator('article[data-paper-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.paperId));
  await page.getByRole('link',{name:'Older assessments',exact:true}).click();await page.getByRole('link',{name:'Newest assessments',exact:true}).waitFor();
  assert.equal(await page.locator('article[data-paper-id]').count(),3);const older=await page.locator('article[data-paper-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.paperId));assert.ok(older.every(id=>!first.includes(id)));
  for(const prefix of ['','/module','/modules']){const r=await fetch(origin+prefix+'/research-verification/test-results?tag=a%26b&tag=second',{redirect:'manual'});assert.equal(r.status,308);const u=new URL(r.headers.get('location'),origin);assert.equal(u.pathname,'/research-verification/previous-assessments');assert.deepEqual(u.searchParams.getAll('tag'),['a&b','second']);}
  return {unique_assessments_seen:new Set([...first,...older]).size,older_page:3,direct_permanent_legacy_redirects:3,repeated_query_values_preserved:true};
 });
 await check('previous assessments preserve missing title empty invalid and unavailable states',async()=>{
  await fixtureMode('title-missing');await page.goto(origin+'/research-verification/previous-assessments');await page.getByText('Paper title unavailable',{exact:true}).waitFor();assert.equal(await page.locator('article[data-paper-id]').count(),10);
  await fixtureMode('catalog-empty');await page.reload();await page.getByRole('heading',{name:'No paper assessments submitted yet',exact:true}).waitFor();
  await fixtureMode('catalog-invalid');await page.reload();await page.getByRole('alert').filter({hasText:'invalid or incomplete'}).waitFor();assert.equal(await page.locator('article[data-paper-id]').count(),0);
  await fixtureMode('unavailable');await page.reload();await page.getByRole('alert').filter({hasText:'counts are unknown'}).waitFor();assert.equal(await page.getByRole('heading',{name:'No paper assessments submitted yet'}).count(),0);
  await fixtureMode('normal');await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('link',{name:paperTitle,exact:true}).waitFor();
  return {missing_title_retains_assessment:true,empty:true,invalid_counts_unknown:true,failed_counts_not_zero:true,recovery:true};
 });
 await check('previous assessments desktop mobile themes and sidebar navigation use the new route',async()=>{
  for(const width of [1365,390])for(const theme of ['Light Mode','Dark Mode']){await page.setViewportSize({width,height:width===390?844:900});await page.getByRole('button',{name:theme,exact:true}).click();await settledTheme(page,theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width===1365){const current=page.locator('aside a[aria-current="page"]');assert.equal(await current.getAttribute('href'),'/research-verification/previous-assessments');}await page.screenshot({path:directory+'/previous-assessments-'+width+'-'+theme.split(' ')[0].toLowerCase()+'.png',fullPage:true});}
  return {widths:[1365,390],themes:['light','dark'],overflow:false,canonical_sidebar_link:true};
 });
 await check('new assessment links legacy redirects and sign-in returns use the canonical intake route',async()=>{
  const canonical='/research-verification/new-assessment',query='?source=paper&tag=a%26b&tag=second';
  await page.goto(origin+'/');const start=page.getByRole('button',{name:'Start verification',exact:true});assert.equal(await start.getAttribute('href'),canonical);await start.click();await page.waitForURL(/\/login\?/);assert.equal(new URL(page.url()).searchParams.get('next'),canonical);
  for(const path of [canonical,...['','/module','/modules'].map(prefix=>prefix+'/research-verification/new-study')]){
   if(path!==canonical){const r=await fetch(origin+path+query,{redirect:'manual'});assert.equal(r.status,308);const location=new URL(r.headers.get('location'),origin);assert.equal(location.pathname,canonical);assert.equal(location.searchParams.get('source'),'paper');assert.deepEqual(location.searchParams.getAll('tag'),['a&b','second']);}
   await page.goto(origin+path+query);assert.equal(new URL(page.url()).pathname,'/login');const next=new URL(new URL(page.url()).searchParams.get('next'),origin);assert.equal(next.pathname,canonical);assert.equal(next.searchParams.get('source'),'paper');assert.deepEqual(next.searchParams.getAll('tag'),['a&b','second']);
  }
  await fixtureMode('catalog-empty');await page.goto(origin+'/research-verification/previous-assessments');await page.getByRole('heading',{name:'No paper assessments submitted yet',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Assess a paper',exact:true}).getAttribute('href'),canonical);
  await page.setViewportSize({width:1365,height:900});assert.equal(await page.locator('aside').getByRole('link',{name:/Assess a Paper/}).getAttribute('href'),canonical);
  return {canonical_route:canonical,homepage_link:true,empty_state_link:true,sidebar_link:true,direct_permanent_legacy_redirects:3,sign_in_return_paths:4,repeated_query_values_preserved:true,authenticated_pdf_submission:'not exercised'};
 });
 await check('assessment detail exports and saved study routes retain public evidence and exact identities',async()=>{
  await fixtureMode('normal');await page.goto(origin+'/research-verification/previous-assessments');const read=page.getByRole('link',{name:'Read assessment',exact:true});await read.waitFor();const path=await read.getAttribute('href');assert.match(path,/^\/research-verification\/assessments\/[a-f0-9-]+$/);const id=path.split('/').at(-1);
  await read.click();await page.waitForURL(origin+path);await page.getByRole('heading',{name:'Synthetic published paper assessment',exact:true}).waitFor();await page.getByRole('navigation',{name:'Assessment evidence',exact:true}).waitFor();assert.ok((await page.locator('main').innerText()).includes('Synthetic published claim'));
  const exportPath='/research-verification/api/assessments/'+id+'/export';assert.equal(await page.getByRole('link',{name:'Download complete published JSON',exact:true}).getAttribute('href'),exportPath);
  const response=await fetch(origin+exportPath);assert.equal(response.status,200);const raw=await response.text(),snapshot=JSON.parse(raw);assert.equal(snapshot.study.id,id);assert.equal(snapshot.records.claims.length,1);assert.equal(snapshot.access,'published-snapshot');assert.ok(!raw.includes('PRIVATE-CANARY'));for(const field of ['artifacts','study_owners','audit_events'])assert.ok(!(field in snapshot.records));
  const csv=await fetch(origin+exportPath+'?format=csv');assert.equal(csv.status,200);assert.match(csv.headers.get('content-type'),/text\/csv/);assert.equal((await fetch(origin+exportPath+'?format=invalid')).status,400);
  for(const prefix of ['','/module','/modules'])for(const [old,canonical] of [['/studies/'+id,path],['/api/studies/'+id+'/export',exportPath]]){const r=await fetch(origin+prefix+'/research-verification'+old+'?view=literature&tag=a%26b&tag=second',{redirect:'manual'});assert.equal(r.status,308);const location=new URL(r.headers.get('location'),origin);assert.equal(location.pathname,canonical);assert.equal(location.searchParams.get('view'),'literature');assert.deepEqual(location.searchParams.getAll('tag'),['a&b','second']);}
  const legacy=await fetch(origin+'/research-verification/api/studies/'+id+'/export');assert.equal(legacy.status,200);assert.equal(await legacy.text(),raw);
  for(const width of [1365,390])for(const theme of ['Light Mode','Dark Mode']){await page.setViewportSize({width,height:width===390?844:900});await page.getByRole('button',{name:theme,exact:true}).click();await settledTheme(page,theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:directory+'/assessment-'+width+'-'+theme.split(' ')[0].toLowerCase()+'.png',fullPage:true});}
  return {canonical_detail:path,canonical_export:exportPath,synthetic_public_claims:1,json_bytes:Buffer.byteLength(raw),json_sha256:createHash('sha256').update(raw).digest('hex'),legacy_redirects:6,legacy_export_bytes_equal:true,private_bytes:false,viewports:[1365,390],themes:['light','dark'],overflow:false};
 });
 await check('queue query aliases preserve identities and reject duplicate or conflicting assessment selections',async()=>{
  const path='/research-verification/experiment-queue',tags='&tag=a%26b&tag=second';
  for(const [old,canonical] of [['?study='+study,'?assessment='+study],['?sourceStudy='+study+'&gap=22222222-2222-4222-8222-222222222222','?sourceAssessment='+study+'&gap=22222222-2222-4222-8222-222222222222']]){
   const r=await fetch(origin+path+old+tags,{redirect:'manual'});assert.equal(r.status,308);const location=new URL(r.headers.get('location'),origin);const expected=new URL(origin+path+canonical+tags);assert.deepEqual([...location.searchParams].sort(),[...expected.searchParams].sort());
   await page.goto(origin+path+old+tags);if(old.startsWith('?study=')){assert.equal(new URL(page.url()).searchParams.get('assessment'),study);assert.equal(new URL(page.url()).searchParams.has('study'),false);await page.getByText(paperTitle,{exact:true}).waitFor();}else{assert.equal(new URL(page.url()).pathname,'/login');const next=new URL(new URL(page.url()).searchParams.get('next'),origin);assert.deepEqual([...next.searchParams].sort(),[...expected.searchParams].sort());}
  }
  for(const query of ['?study='+study+'&assessment='+study,'?sourceStudy='+study+'&sourceAssessment='+study+'&gap=22222222-2222-4222-8222-222222222222','?study='+study+'&study='+study,'?assessment='+study+'&assessment='+study]){await page.goto(origin+path+query);await page.getByRole('alert').filter({hasText:'invalid assessment'}).waitFor();assert.equal(await page.getByTestId('public-experiment-queue').count(),0);assert.equal(await page.getByTestId('experiment-queue-dashboard').count(),0);}
  await page.goto(origin+'/research-verification/methods');await page.getByText('Explore an illustrative claim queue',{exact:true}).click();assert.match(await page.getByTestId('claim-queue').innerText(),/active jobs in this assessment/);await page.getByRole('combobox',{name:'Queue example state',exact:true}).click();await page.getByRole('option',{name:'New assessment awaiting preparation',exact:true}).click();await page.getByRole('heading',{name:'Assessment preparation required',exact:true}).waitFor();
  return {saved_query_redirects:2,repeated_tags_preserved:true,owner_action_return_preserved:true,ambiguous_selections_rejected:4,assessment_terminology:true};
 });
 await check('My Assessments list replaces workspace with exact redirects and retains private versus public access',async()=>{
  const canonical='/research-verification/assessments',query='?tag=a%26b&tag=second';
  await page.setViewportSize({width:1365,height:900});await fixtureMode('normal');await page.goto(origin+'/research-verification/previous-assessments');await page.getByRole('link',{name:'Read assessment',exact:true}).waitFor();
  const mine=page.locator('aside').getByRole('link',{name:'My Assessments',exact:true});assert.equal(await mine.getAttribute('href'),canonical);assert.equal(await page.getByRole('link',{name:'My Workspace',exact:true}).count(),0);await mine.click();await page.waitForURL(/\/login\?/);assert.equal(new URL(page.url()).searchParams.get('next'),canonical);
  for(const path of [canonical,...['','/module','/modules'].map(prefix=>prefix+'/research-verification/workspace')]){
   if(path!==canonical){const r=await fetch(origin+path+query,{redirect:'manual'});assert.equal(r.status,308);const location=new URL(r.headers.get('location'),origin);assert.equal(location.pathname,canonical);assert.deepEqual(location.searchParams.getAll('tag'),['a&b','second']);}
   await page.goto(origin+path+query);assert.equal(new URL(page.url()).pathname,'/login');const next=new URL(new URL(page.url()).searchParams.get('next'),origin);assert.equal(next.pathname,canonical);assert.deepEqual(next.searchParams.getAll('tag'),['a&b','second']);
  }
  const privateDetail='/research-verification/workspace/'+study+'?view=gaps';await page.goto(origin+privateDetail);assert.equal(new URL(page.url()).pathname,'/login');assert.equal(new URL(page.url()).searchParams.get('next'),privateDetail);
  await page.goto(origin+'/research-verification/previous-assessments');const read=page.getByRole('link',{name:'Read assessment',exact:true});await read.waitFor();const publicDetail=await read.getAttribute('href');await read.click();await page.waitForURL(origin+publicDetail);await page.getByRole('heading',{name:'Synthetic published paper assessment',exact:true}).waitFor();assert.equal(await page.locator('aside a[aria-current="page"]').getAttribute('href'),'/research-verification/previous-assessments');
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open module menu',exact:true}).click();assert.equal(await page.getByRole('dialog').getByRole('link',{name:'My Assessments',exact:true}).getAttribute('href'),canonical);await page.getByRole('dialog').getByRole('link',{name:'My Assessments',exact:true}).click();await page.waitForURL(/\/login\?/);assert.equal(new URL(page.url()).searchParams.get('next'),canonical);
  return {canonical_list:canonical,sidebar_label:'My Assessments',legacy_root_redirects:3,repeated_queries_preserved:true,anonymous_list_requires_login:true,private_detail_requires_login:true,published_detail_public:true,desktop_and_mobile_navigation:true,authenticated_list_contents:'not exercised'};
 });
 assert.deepEqual(report.browser_errors,[]);assert.ok(report.requests.length);assert.ok(report.requests.every(r=>r.method==='GET'&&!r.authorization_present&&!r.cookie_present&&!r.unexpected_private_path));report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;process.exitCode=1;if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await writeFile(directory+'/failure.html',await page.content());await page.screenshot({path:directory+'/failure.png',fullPage:true});}}}
finally{if(browser)await browser.close();if(build&&build.exitCode===null)build.kill('SIGTERM');if(app)app.kill('SIGTERM');if(python)python.kill('SIGTERM');report.ended_at=new Date().toISOString();await writeFile(directory+'/python.log',pythonLog);await writeFile(directory+'/build.log',buildLog);await writeFile(directory+'/next.log',appLog);await writeFile(directory+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({directory,passed:report.passed,error:report.error}));}
