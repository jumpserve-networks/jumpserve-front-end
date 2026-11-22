// Fixed read-only checks for the three local imports. No authentication or inference.
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const {values}=parseArgs({options:{origin:{type:'string',default:'https://jumpserve.quaint-lab.org'},revision:{type:'string'}}});
const origin=new URL(values.origin);
assert.ok(['https://jumpserve.quaint-lab.org','http://localhost:6001'].includes(origin.origin)&&origin.pathname==='/'&&!origin.search&&!origin.hash&&!origin.username&&!origin.password);
if(origin.hostname!=='localhost')assert.match(values.revision??'',/^[a-f0-9]{40}$/);
const studies=[
 {id:'b702bf86-5b1e-42d4-8262-f4183d6da4fc',title:'One-Sided Delay and Ping Round-Trip Time'},
 {id:'8f4c8c02-432f-4023-aef4-8bf07d20484f',title:'Router Buffer Capacity and Interactive Delay Under Persistent Bottleneck Load'},
 {id:'2aafa29a-dc29-45c6-a8cd-54269a8b4f3d',title:'The Impact of Packet Loss on TCP Throughput in Controlled Networks'},
];
const directory='.test-artifacts/local-assessment-release/'+new Date().toISOString().replaceAll(':','-');await mkdir(directory,{recursive:true});
const report={origin:origin.origin,revision:values.revision??null,passed:false,checks:[],browser_errors:[],research_writes:[],private_requests:[],limitations:['Google OAuth and authenticated owner actions are not exercised.','No model calls or Linux experiment execution.']};
let browser;
try{
 if(values.revision){const response=await fetch(new URL('/api/platform-version',origin),{cache:'no-store'});assert.equal(response.status,200);assert.equal((await response.json()).revision,values.revision);report.checks.push('Exact production revision');}
 const progress=await fetch(new URL('/research-verification/api/assessment-progress?'+new URLSearchParams(studies.map(s=>['id',s.id])),origin));assert.equal(progress.status,200);assert.deepEqual((await progress.json()).assessments.map(x=>x.step),[4,4,4]);report.checks.push('All three saved progress records show Step 4');
 const executablePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 browser=await chromium.launch({headless:true,...(existsSync(executablePath)?{executablePath}:{})});
 const context=await browser.newContext({viewport:{width:1365,height:900}}),page=await context.newPage();page.setDefaultTimeout(20000);
 page.on('pageerror',e=>report.browser_errors.push(e.message));
 page.on('request',request=>{const url=new URL(request.url());if(url.pathname.includes('/research')&&!['GET','HEAD','OPTIONS'].includes(request.method()))report.research_writes.push({path:url.pathname,method:request.method()});if(/\/api\/(paper-intake|experiment-plan|experiment-scripts)(?:\?|$)/.test(url.pathname))report.private_requests.push(url.pathname);});
 for(const study of studies){
  const path='/research-verification/assessment/'+study.id;
  for(const step of ['breakdown','implementation','execution']){
   const response=await page.goto(new URL(path+'?step='+step,origin).href,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
   const shared=page.getByRole('region',{name:'Shared local assessment',exact:true});await shared.waitFor();await page.getByRole('heading',{name:study.title,exact:true}).first().waitFor();
   assert.ok(await shared.getByText('Prepared with local Codex · Read-only assessment',{exact:true}).count());
   assert.equal(await shared.getByRole('navigation',{name:'Shared assessment steps'}).getByRole('link').count(),3);
   for(const label of ['Continue to Step 3','Generate','Cancel script generation','Prepare breakdown','View assessment records'])assert.equal(await shared.getByRole('button',{name:label,exact:true}).count(),0);
   assert.equal(await shared.getByRole('checkbox').count(),0);assert.equal(await shared.getByRole('textbox').count(),0);
   const html=await response.text();for(const key of ['paper_text','original_artifact_id','text_artifact_id','local_codex_assessment_owner','research-workflow-raw/','research-paper-uploads/'])assert.equal(html.includes(key),false,'Private key in shared HTML: '+key);
   if(step==='execution'){assert.ok((await shared.getByLabel('Commands for shared setup',{exact:true}).textContent()).includes('LOCAL_CODEX_EXPERIMENT_PY'));if(study.id.startsWith('2aafa29a'))assert.equal(await shared.getByText('Commands blocked · step 1.3.1',{exact:true}).count(),1);}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   report.checks.push(study.id+' '+step+' publicly readable, source-redacted and read-only');
  }
 }
 // Exercise actual client navigation in the public view at mobile width and both themes.
 await page.setViewportSize({width:390,height:844});await page.goto(new URL('/research-verification/assessment/'+studies[0].id,origin).href);
 for(const theme of ['Light Mode','Dark Mode']){
  await page.getByRole('button',{name:theme,exact:true}).click();
  await page.getByRole('navigation',{name:'Shared assessment steps'}).getByRole('link',{name:'Step 4 · Setup',exact:true}).click();
  await page.getByRole('heading',{name:'Setup',exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:directory+'/shared-mobile-'+(theme==='Dark Mode'?'dark':'light')+'.png',fullPage:true});
 }
 report.checks.push('Mobile light/dark rendering and step navigation');
 for(const endpoint of ['paper-intake','experiment-plan','experiment-scripts']){
  const response=await fetch(new URL('/research-verification/api/'+endpoint,origin),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,401);
 }
 report.checks.push('Anonymous writes remain unauthorized');
 assert.deepEqual(report.research_writes,[]);assert.deepEqual(report.private_requests,[]);assert.deepEqual(report.browser_errors,[]);report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;}
finally{if(browser)await browser.close();await writeFile(directory+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({directory,...report}));}
