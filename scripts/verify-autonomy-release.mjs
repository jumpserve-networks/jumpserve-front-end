// Fixed production read-only checks. Never submits a study or exposes credentials.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const mode=process.argv[2];assert.ok(['--preflight','--deployed'].includes(mode)&&process.argv.length===3);
const origin='https://jumpserve.quaint-lab.org',api='https://d3o7xdethb.execute-api.us-east-1.amazonaws.com/research';
const directory='.test-artifacts/autonomy-release-production/'+new Date().toISOString().replaceAll(':','-');await mkdir(directory,{recursive:true});
const report={mode,origin,checks:[],conditional_gaps:[],reviewer:{identity:'Primary Codex AI implementer',type:'AI',independent:false},new_model_calls:0,new_experiments:0,measured_charges_usd:null};
async function check(name,fn){try{report.checks.push({name,passed:true,evidence:await fn()});console.log('PASS '+name);}catch(error){report.checks.push({name,passed:false,reason:error.message});throw error;}}
let own,connected,page;
try{
 const profile='/var/folders/4n/drzdg_9x2qj_2_vdc3t0_zc80000gn/T/agent-browser-chrome-90167fdd-bc06-412c-84b3-a4cdf93c7331/DevToolsActivePort';
 if(existsSync(profile)){
  try{
   const port=Number((await readFile(profile,'utf8')).split('\n')[0]);assert.ok(Number.isInteger(port)&&port>1024&&port<65536);
   connected=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:10000});const context=connected.contexts()[0];page=await context.newPage();
   await page.goto(origin+'/research-verification/new-study',{waitUntil:'domcontentloaded',timeout:30000});
   report.legitimate_existing_session=new URL(page.url()).pathname==='/research-verification/new-study';
   if(report.legitimate_existing_session){
    const pending=page.waitForResponse(r=>r.url()===api+'/queue'&&r.request().method()==='GET',{timeout:15000}).catch(()=>null);
    await page.goto(origin+'/research-verification/experiment-queue',{waitUntil:'domcontentloaded'});
    const response=await pending;
    report.authenticated_queue_status=response?.status()??null;
    if(mode==='--deployed'){assert.equal(report.authenticated_queue_status,200);await page.screenshot({path:directory+'/private-authenticated-queue.png',fullPage:true});}
   }
  }catch(error){if(mode==='--deployed'&&report.legitimate_existing_session)throw error;report.session_probe_error=error.message;report.legitimate_existing_session=false;}
  finally{if(page)await page.close();page=null;}
 }
 if(!report.legitimate_existing_session)report.conditional_gaps.push('No usable legitimate existing Google session was available; no session fabricated.');
 if(mode==='--deployed'){
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';own=await chromium.launch({headless:true,executablePath:existsSync(chrome)?chrome:undefined});const context=await own.newContext({viewport:{width:1365,height:900}});page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await check('public production entry points and previous results render',async()=>{
   for(const path of ['/','/research-verification/test-results','/research-verification/methods','/ipv6-dns-study/test-results']){const response=await page.goto(origin+path,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);assert.doesNotMatch(await page.locator('body').innerText(),/Application error:|Internal Server Error/);}
   await page.getByRole('heading',{name:'DNS over IPv6: results and evidence limits',exact:true}).waitFor();return {paths:4,archived_results_available:true};
  });
  await check('desktop and mobile themes preserve readable public results',async()=>{
   for(const width of [1365,390]){await page.setViewportSize({width,height:900});for(const theme of ['Light Mode','Dark Mode']){await page.getByRole('button',{name:theme,exact:true}).click();await page.waitForFunction(dark=>document.documentElement.classList.contains('dark')===dark,theme==='Dark Mode');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:directory+'/public-'+width+'-'+theme.split(' ')[0]+'.png',fullPage:true});}}return {widths:[1365,390],themes:['light','dark']};
  });
  await check('anonymous queue and new-study paths retain their login destination',async()=>{
   for(const path of ['/research-verification/new-study','/research-verification/experiment-queue?study=00000000-0000-4000-8000-000000000001']){await page.goto(origin+path,{waitUntil:'domcontentloaded'});assert.equal(new URL(page.url()).pathname,'/login');assert.equal(new URL(page.url()).searchParams.get('next'),path);}return {paths:2,anonymous_owner_access_denied:true};
  });
  await check('missing public data is explicit and exports return 404',async()=>{
   const id='9fe82c67-2a99-49b9-8bfc-670b69ab1944';await page.goto(origin+'/research-verification/studies/'+id,{waitUntil:'domcontentloaded'});assert.match(await page.locator('main').innerText(),/no public assessment|unavailable/i);const response=await fetch(origin+'/research-verification/api/studies/'+id+'/export');assert.equal(response.status,404);return {missing_export_status:404};
  });
  await check('deployed autonomy version and fixed limits match the release',async()=>{const response=await fetch(api+'/capabilities');assert.equal(response.status,200);const data=await response.json();assert.equal(data.autonomy.version,'research-autonomy-v2');assert.equal(data.autonomy.enabled,true);assert.equal(data.autonomy.defaults.attempts_per_claim,25);assert.equal(data.autonomy.defaults.maximum_spend_usd,100);assert.equal(data.autonomy.defaults.elapsed_days,7);return {autonomy:data.autonomy};});
  assert.deepEqual(errors,[]);
 }
 report.passed=true;
}catch(error){report.passed=false;report.failure=error.message;}
finally{
 if(page)await page.close();if(own)await own.close();
 // Do not close the user's connected Chrome or its default context/tabs.
 report.ended_at=new Date().toISOString();await writeFile(directory+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({directory,passed:report.passed,legitimate_existing_session:report.legitimate_existing_session,conditional_gaps:report.conditional_gaps,failure:report.failure}));
 process.exit(report.passed?0:1);
}
