// Actual Next routes and components; fixed, explicit local auth/API fixtures.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
assert.equal(process.argv.length, 2, 'Fixed local verification; no arbitrary targets.');
const origin='http://127.0.0.1:6107',api='http://127.0.0.1:4107';
const out='.test-artifacts/prompts/'+new Date().toISOString().replaceAll(':','-');await mkdir(out,{recursive:true});
const actor='11111111-1111-4111-8111-111111111111';
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:actor,role:'authenticated',exp:4102444800})+'.explicit-local-fixture';
const user={id:actor,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{provider:'google',providers:['google']},user_metadata:{given_name:'Fixture',family_name:'User'},identities:[],is_anonymous:false,created_at:'2026-01-01T00:00:00Z'};
const session={access_token:token,token_type:'bearer',refresh_token:'explicit-local-refresh',expires_in:3600,expires_at:4102444800,user};
const prompts=Array.from({length:3},(_,i)=>({id:`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,module_id:i===2?'research-experiment-builder':'research-autonomy',version:['autonomy-live-v1','autonomy-draft-v2','builder-published-v1'][i],content_sha256:'a'.repeat(64),created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z',published_at:i===1?null:'2026-11-01T00:00:00Z',active:i===0}));
let mode='normal',indexReads=0,detailReads=0,build,app,browser,buildLog='',appLog='';
const checks=[],errors=[];
const server=createServer((req,res)=>{
 const path=new URL(req.url,api).pathname;
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info'});res.end(JSON.stringify(data));};
 if(req.method==='OPTIONS')return send(200,{});
 const signed=req.headers.authorization==='Bearer '+token;
 if(path==='/auth/v1/user')return send(signed?200:401,signed?user:{message:'Synthetic fixture sign-in required.'});
 if(path==='/rest/v1/profiles')return send(200,[]);
 if(path==='/research/prompts'||path.startsWith('/research/prompts/')){
  if(!signed)return send(401,{});
  if(mode==='unavailable')return send(503,{});
  if(path==='/research/prompts'){indexReads++;return send(200,{version:'prompt-catalog-v1',prompts});}
  const prompt=prompts.find(p=>p.id===path.split('/').at(-1));if(!prompt)return send(404,{});
  detailReads++;return send(200,{version:'prompt-catalog-v1',prompt:{...prompt,system_prompt:'Exact template <script>window.promptExecuted=true</script>\n'+('unbroken-template-content'.repeat(30)),research_context:JSON.stringify({schema:'example-context',notes:'Complete stored context'})}});
 }
 return send(404,{});
});
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4107,'127.0.0.1',resolve);});
 const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_ANON_KEY:'explicit-local-anon',NEXT_PUBLIC_SITE_URL:origin,NEXT_PUBLIC_RESEARCH_CATALOG_API_URL:api,NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL:api,NEXT_PUBLIC_BENCHMARK_API_URL:api};
 build=spawn('npm',['run','build'],{env,stdio:['ignore','pipe','pipe']});build.stdout.on('data',c=>buildLog+=c);build.stderr.on('data',c=>buildLog+=c);
 assert.equal(await new Promise((resolve,reject)=>{build.on('exit',resolve);build.on('error',reject);}),0,'Next build failed; inspect build.log.');
 app=spawn('node',['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','6107'],{env,stdio:['ignore','pipe','pipe']});app.stdout.on('data',c=>appLog+=c);app.stderr.on('data',c=>appLog+=c);
 for(let i=0;i<160;i++){try{if((await fetch(origin+'/login')).ok)break;}catch{}if(i===159)throw Error('Next readiness budget exceeded.');await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({headless:true,executablePath:existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined});
 const context=await browser.newContext({viewport:{width:1365,height:900}});
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await check('global Prompts link preserves sign-in destination and anonymous reads load no templates',async()=>{
  await page.goto(origin+'/login');await page.getByRole('link',{name:'Prompts',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/login'&&url.searchParams.get('next')==='/prompts');assert.equal(indexReads,0);assert.equal(detailReads,0);
 });
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+encode(session),url:origin,sameSite:'Lax'}]);
 await check('Platform Updates lives in desktop and mobile sidebars on global and module routes',async()=>{
  for(const path of ['/prompts','/research-verification/assessments','/platform-updates','/platform-updates/'+prompts[0].id]){
   await page.goto(origin+path);const sidebar=page.locator('[data-slot="module-sidebar"]');
   const link=sidebar.getByRole('link',{name:'Platform Updates',exact:true});assert.equal(await link.getAttribute('href'),'/platform-updates');
   assert.equal(await page.locator('header').getByRole('link',{name:'Platform updates',exact:true}).count(),0);
   assert.equal(await link.getAttribute('aria-current'),path.startsWith('/platform-updates')?'page':null);
  }
  await page.setViewportSize({width:390,height:844});
  for(const path of ['/prompts','/research-verification/assessments']){
   await page.goto(origin+path);await page.getByRole('button',{name:path==='/prompts'?'Open navigation menu':'Open module menu',exact:true}).click();
   const menu=page.getByRole('dialog');await menu.getByRole('link',{name:'Platform Updates',exact:true}).click();
   await page.waitForURL(url=>url.pathname==='/platform-updates');assert.equal(await page.getByRole('dialog').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.setViewportSize({width:1365,height:900});
 });
 await check('signed-in index lists active, published and draft versions without fetching bodies',async()=>{
  await page.goto(origin+'/prompts');await page.getByRole('heading',{name:'Prompts',exact:true}).waitFor();assert.equal(await page.locator('main article').count(),3);assert.equal(detailReads,0);
  for(const status of ['Active','Published','Draft'])assert.equal(await page.locator('main article').getByText(status,{exact:true}).count(),1);
  await page.locator('main article time').first().filter({hasText:'2026'}).waitFor();await page.screenshot({path:out+'/desktop.png',fullPage:true});
 });
 await check('search, area and status filters combine and show an honest empty state',async()=>{
  await page.getByLabel('Search prompts').fill('draft');assert.equal(await page.locator('main article').count(),1);
  await page.getByRole('combobox',{name:'Status',exact:true}).click();await page.getByRole('option',{name:'Active',exact:true}).click();await page.getByText('No prompts match these filters.').waitFor();
  await page.getByLabel('Search prompts').fill('');assert.equal(await page.locator('main article').count(),1);
  await page.getByRole('combobox',{name:'Status',exact:true}).click();await page.getByRole('option',{name:'All versions',exact:true}).click();
  await page.getByRole('combobox',{name:'Area',exact:true}).click();await page.getByRole('option',{name:'Experiment builder',exact:true}).click();assert.equal(await page.locator('main article').count(),1);
  await page.getByRole('combobox',{name:'Area',exact:true}).click();await page.getByRole('option',{name:'All areas',exact:true}).click();
 });
 await check('opening a version shows exact escaped content, provenance and back navigation',async()=>{
  await page.getByRole('link',{name:'autonomy-live-v1',exact:true}).click();await page.getByRole('heading',{name:'System prompt',exact:true}).waitFor();
  assert.ok(await page.locator('main pre').first().innerText().then(t=>t.includes('<script>window.promptExecuted=true</script>')));assert.equal(await page.evaluate(()=>window.promptExecuted),undefined);assert.ok(detailReads>=1);
  assert.equal(await page.getByText('Content SHA-256',{exact:true}).count(),1);assert.equal(await page.locator('main pre').count(),2);
  await page.screenshot({path:out+'/detail-desktop.png',fullPage:true});
  await page.getByRole('link',{name:'All prompts',exact:true}).click();await page.getByLabel('Search prompts').waitFor();
 });
 await check('mobile light/dark index and long prompt text fit the viewport',async()=>{
  await page.setViewportSize({width:390,height:844});
  for(const path of ['/prompts','/prompts/'+prompts[0].id]){
   await page.goto(origin+path);await page.locator('main h1').waitFor();
   for(const theme of ['Light Mode','Dark Mode']){await page.getByRole('button',{name:theme,exact:true}).click();await page.waitForFunction(dark=>document.documentElement.classList.contains('dark')===dark,theme==='Dark Mode');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/mobile-'+(path==='/prompts'?'index':'detail')+'-'+theme.split(' ')[0].toLowerCase()+'.png',fullPage:true});}
  }
 });
 await check('service outages and unknown versions remain visible and retry recovers',async()=>{
  mode='unavailable';await page.goto(origin+'/prompts');await page.locator('main [role=alert]').getByText('The prompt service is temporarily unavailable.').waitFor();mode='normal';await page.getByRole('link',{name:'Try again',exact:true}).click();await page.getByLabel('Search prompts').waitFor();
  await page.goto(origin+'/prompts/20000000-0000-4000-8000-999999999999');await page.getByText('Prompt version not found.',{exact:true}).waitFor();
 });
 assert.deepEqual(errors,[]);
}catch(error){process.exitCode=1;errors.push(error.stack);if(browser){const page=browser.contexts()[0]?.pages()[0];if(page)await page.screenshot({path:out+'/failure.png',fullPage:true});}}
finally{
 if(browser)await browser.close();for(const child of [build,app])if(child&&child.exitCode===null)child.kill('SIGTERM');await new Promise(resolve=>server.close(resolve));
 await Promise.all([writeFile(out+'/report.json',JSON.stringify({passed:checks.length===7&&errors.length===0,checks,errors,index_reads:indexReads,detail_reads:detailReads,synthetic_auth_and_api:true,actual_next_routes:true,production_writes:0},null,2)+'\n'),writeFile(out+'/build.log',buildLog),writeFile(out+'/next.log',appLog)]);
 console.log(JSON.stringify({directory:out,checks:checks.length,errors}));
}
