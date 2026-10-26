// Fixed local Next -> Supabase transport fixture -> actual isolated PostgreSQL.
// Synthetic Google/JWT transport is explicit and never contacts a real account.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
assert.equal(process.argv.length,2,'Fixed local campaign; no arbitrary targets.');
const origin='http://127.0.0.1:6105',api='http://127.0.0.1:4105';
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const directory='.test-artifacts/profiles/'+new Date().toISOString().replaceAll(':','-');
await mkdir(directory,{recursive:true});
const report={protocol:'profile-timezone-development-v1',started_at:new Date().toISOString(),checks:[],failures:[],browser_errors:[],synthetic_auth:true,synthetic_supabase_transport:true,actual_postgres:true,remote_writes:0,model_calls:0,measured_charges_usd:null,reviewer:{identity:'Primary Codex AI implementer',type:'AI',independent:false},conditional_gaps:['Legitimate Google provider session and production deployment/migration are not exercised.']};
let fixture,build,app,browser,fixtureLog='',buildLog='',appLog='';
async function check(name,fn){try{const evidence=await fn();report.checks.push({name,passed:true,evidence});console.log('PASS '+name);}catch(error){report.failures.push({name,error:error.message});throw error;}}
async function ready(url,child){for(let i=0;i<240;i++){try{const r=await fetch(url);if(r.ok)return await r.json();}catch{}if(child.exitCode!==null)throw Error('Local fixture/server stopped; inspect retained log.');await new Promise(r=>setTimeout(r,250));}throw Error('Local fixture readiness budget exceeded.');}
async function session(context,data){await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(data)).toString('base64url'),url:origin,httpOnly:false,sameSite:'Lax'}]);}
try{
 fixture=spawn('python3',['-B','test/check_profile_database.py','--serve'],{cwd:'../jumpserve-infra',stdio:['ignore','pipe','pipe']});fixture.stdout.on('data',c=>fixtureLog+=c);fixture.stderr.on('data',c=>fixtureLog+=c);
 const metadata=await ready(api+'/fixture/metadata',fixture);report.database=metadata.database;report.database_report=metadata.sql_report;
 const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_ANON_KEY:'explicit-local-anon',NEXT_PUBLIC_SITE_URL:origin,NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL:api,NEXT_PUBLIC_BENCHMARK_API_URL:api};
 build=spawn('npm',['run','build'],{env,stdio:['ignore','pipe','pipe']});build.stdout.on('data',c=>buildLog+=c);build.stderr.on('data',c=>buildLog+=c);assert.equal(await new Promise((resolve,reject)=>{build.on('exit',resolve);build.on('error',reject);}),0,'Fixture build failed.');
 app=spawn('node',['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','6105'],{env,stdio:['ignore','pipe','pipe']});app.stdout.on('data',c=>appLog+=c);app.stderr.on('data',c=>appLog+=c);
 // This authenticated endpoint is 401 until a synthetic cookie is supplied.
 for(let i=0;i<120;i++){try{if((await fetch(origin+'/api/profile')).status===401)break;}catch{}if(i===119)throw Error('Next readiness budget exceeded.');await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({headless:true,executablePath:existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined});
 const context=await browser.newContext({viewport:{width:1365,height:900},timezoneId:'America/Los_Angeles'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());return ['http:','https:'].includes(u.protocol)&&!['127.0.0.1','localhost'].includes(u.hostname)?route.abort():route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.browser_errors.push(e.message));
 await check('anonymous profile requires sign-in and public timestamps use browser timezone',async()=>{assert.equal((await context.request.get(origin+'/api/profile')).status(),401);await page.goto(origin+'/profile');const u=new URL(page.url());assert.equal(u.pathname,'/login');assert.equal(u.searchParams.get('next'),'/profile');await page.goto(origin+'/research-verification/previous-assessments');await page.locator('article[data-paper-id] time').filter({hasText:'Oct 23, 2026, 11:00:00 AM PDT'}).waitFor();return {private_get_status:401,next:'/profile',anonymous_timezone:'America/Los_Angeles'};});
 await check('first Google callback persists names automatically and resumes the requested page',async()=>{
  const first='44444444-4444-4444-8444-444444444444';
  const before=await (await fetch(api+'/fixture/state')).json();assert.ok(!before.rows.some(row=>row.id===first));
  await context.addCookies([{name:'sb-127-auth-token-code-verifier',value:'base64-'+Buffer.from(JSON.stringify('explicit-local-code-verifier')).toString('base64url'),url:origin,sameSite:'Lax'}]);
  await page.goto(origin+'/auth/callback?code=explicit-local-first-login&next='+encodeURIComponent('/research-verification/previous-assessments?from=oauth'));
  assert.equal(new URL(page.url()).pathname,'/research-verification/previous-assessments');assert.equal(new URL(page.url()).search,'?from=oauth');
  const state=await (await fetch(api+'/fixture/state')).json();assert.deepEqual(state.rows.find(row=>row.id===first),{id:first,first_name:'Fixture',last_name:'User',timezone:null});
  const response=await context.request.get(origin+'/api/profile');assert.equal(response.status(),200);assert.equal((await response.json()).profile.first_name,'Fixture');
  await page.goto(origin+'/profile');await page.getByLabel('First name',{exact:true}).waitFor();assert.equal(await page.getByLabel('First name',{exact:true}).inputValue(),'Fixture');assert.equal(await page.getByLabel('Last name',{exact:true}).inputValue(),'User');
  await context.clearCookies();return {actual_next_callback:true,actual_postgres_insert:true,synthetic_google_exchange:true,manual_name_entry:false,requested_destination_preserved:true};
 });
 await session(context,metadata.sessions[actor]);
 await check('saved profile loads through actual Next API and database',async()=>{await page.goto(origin+'/profile');await page.getByLabel('First name',{exact:true}).waitFor();assert.equal(await page.getByLabel('First name',{exact:true}).inputValue(),'Ada');assert.equal(await page.getByLabel('Time zone',{exact:true}).inputValue(),'America/New_York');return {browser_timezone:'America/Los_Angeles',saved_timezone:'America/New_York'};});
 let actionId;
 await check('profile saves names/timezone and updates timestamp display',async()=>{
  page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/profile')actionId=r.headers()['next-action'];});
  await page.getByLabel('First name',{exact:true}).fill('Grace');await page.getByLabel('Last name',{exact:true}).fill('Hopper');await page.getByLabel('Time zone',{exact:true}).fill('Asia/Tokyo');await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.getByRole('status').filter({hasText:'Profile saved.'}).waitFor();assert.ok(actionId);
  await page.goto(origin+'/research-verification/previous-assessments');const time=page.locator('article[data-paper-id] time');await time.filter({hasText:'Oct 24, 2026, 3:00:00 AM GMT+9'}).waitFor();assert.equal(await time.getAttribute('datetime'),'2026-10-23T18:00:00.000Z');assert.ok(!(await page.locator('article[data-paper-id]').innerText()).includes('33333333-3333-4333-8333-333333333333'));
  await page.goto(origin+'/profile');await page.getByLabel('First name',{exact:true}).waitFor();assert.equal(await page.getByLabel('First name',{exact:true}).inputValue(),'Grace');assert.equal(await page.getByLabel('Time zone',{exact:true}).inputValue(),'Asia/Tokyo');
  const state=await (await fetch(api+'/fixture/state')).json();assert.equal(state.rows.find(x=>x.id===actor).timezone,'Asia/Tokyo');assert.equal(state.rows.find(x=>x.id===other).timezone,'Europe/London');return {persisted:true,original_instant_preserved:true,other_profile_unchanged:true,assessment_id_text_removed:true};
 });
 await check('invalid fields, forged identity and cross-origin action do not write',async()=>{
  const before=await (await fetch(api+'/fixture/state')).json();await page.getByLabel('Time zone',{exact:true}).fill('not/a-zone');await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.getByRole('alert').filter({hasText:'valid time zone'}).waitFor();
  const rejected=await context.request.post(origin+'/profile',{headers:{'Next-Action':actionId,Accept:'text/x-component',Origin:origin,'Content-Type':'text/plain;charset=UTF-8'},data:JSON.stringify([{first_name:'Forged',last_name:'Person',timezone:'UTC',id:other}])});assert.ok((await rejected.text()).includes('Only first name'));
  const csrf=await context.request.post(origin+'/profile',{headers:{'Next-Action':actionId,Accept:'text/x-component',Origin:'https://untrusted.example','Content-Type':'text/plain;charset=UTF-8'},data:JSON.stringify([{first_name:'Forged',last_name:'Person',timezone:'UTC'}])});assert.ok(csrf.status()>=400);
  const after=await (await fetch(api+'/fixture/state')).json();assert.deepEqual(after,before);return {browser_validation:true,server_identity_validation:true,csrf_status:csrf.status(),writes_unchanged:true};
 });
 await check('profile outage is visible and retry restores persisted values',async()=>{await fetch(api+'/fixture/mode',{method:'POST',body:JSON.stringify({mode:'unavailable'})});await page.reload();await page.getByRole('alert').filter({hasText:'Synthetic profile storage outage'}).waitFor();await fetch(api+'/fixture/mode',{method:'POST',body:JSON.stringify({mode:'normal'})});await page.getByRole('button',{name:'Try again'}).click();await page.getByLabel('First name',{exact:true}).waitFor();assert.equal(await page.getByLabel('First name',{exact:true}).inputValue(),'Grace');return {outage_and_retry:true};});
 for(const width of [1365,390])for(const theme of ['light','dark'])await check(`profile ${width} ${theme}`,async()=>{await page.setViewportSize({width,height:width===390?844:900});await page.getByRole('button',{name:theme==='dark'?'Dark Mode':'Light Mode',exact:true}).click();await page.waitForFunction(dark=>document.documentElement.classList.contains('dark')===dark,theme==='dark');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.getByRole('link',{name:'Your profile',exact:true}).waitFor();await page.screenshot({path:`${directory}/profile-${width}-${theme}.png`,fullPage:true});return {horizontal_overflow:false};});
 await check('second user receives their own saved timezone and names',async()=>{await context.clearCookies();await session(context,metadata.sessions[other]);await page.reload();await page.getByLabel('First name',{exact:true}).waitFor();assert.equal(await page.getByLabel('First name',{exact:true}).inputValue(),'Other');assert.equal(await page.getByLabel('Time zone',{exact:true}).inputValue(),'Europe/London');return {other_profile_preserved:true};});
 assert.deepEqual(report.browser_errors,[]);report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;process.exitCode=1;if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:directory+'/failure.png',fullPage:true});await writeFile(directory+'/failure.html',await page.content());}}}
finally{if(browser)await browser.close();for(const child of [build,app,fixture])if(child&&child.exitCode===null)child.kill('SIGTERM');report.ended_at=new Date().toISOString();await Promise.all([writeFile(directory+'/report.json',JSON.stringify(report,null,2)+'\n'),writeFile(directory+'/fixture.log',fixtureLog),writeFile(directory+'/build.log',buildLog),writeFile(directory+'/next.log',appLog)]);console.log(JSON.stringify({directory,passed:report.passed,cases:report.checks.length,error:report.error}));}
