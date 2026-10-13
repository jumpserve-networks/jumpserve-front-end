// Fixed public production browser verification; no fake auth or write actions.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin='https://jumpserve.quaint-lab.org',base='/module/research-verification';
if(process.argv.length>2)throw new Error('Fixed production verification only.');
const directory='.test-artifacts/research-ideas/production/'+new Date().toISOString().replaceAll(':','-');await mkdir(directory,{recursive:true});
const report={started_at:new Date().toISOString(),origin,checks:[],browser_errors:[],reviewer:{identity:'Primary Codex AI implementer',type:'AI',independent:false},conditional_gaps:['No legitimate Google browser session: authenticated idea creation/planning/reviews and cross-owner actions unverified','No completed published idea yet; existing paper result pages provide deployed recorded-study coverage','Independent human or held-out validation'],new_model_calls:0,measured_charges_usd:null};
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined});
 const context=await browser.newContext({viewport:{width:1365,height:900}}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>report.browser_errors.push(error.message));
 async function check(name,action){report.checks.push({name,passed:true,evidence:await action()});console.log('PASS '+name);}
 await check('deployed homepage links to unpublished idea intake',async()=>{const res=await page.goto(origin,{waitUntil:'domcontentloaded'});assert.equal(res.status(),200);const link=page.getByRole('link',{name:'Develop a research idea',exact:true});await link.waitFor();assert.equal(await link.getAttribute('href'),base+'/new-idea');return {href:base+'/new-idea'};});
 await check('cookie-free idea routes preserve exact sign-in return paths',async()=>{for(const path of [base+'/new-idea',base+'/ideas/953f20a3-3fd8-4fb4-8844-5d4d72690e99']){await page.goto(origin+path,{waitUntil:'domcontentloaded'});await page.waitForURL(/\/login\?/);assert.equal(new URL(page.url()).searchParams.get('next'),path);}return {paths:2,authenticated:false};});
 await check('deployed methods describe fresh reviews and scientific limits',async()=>{const res=await page.goto(origin+base+'/methods',{waitUntil:'domcontentloaded'});assert.equal(res.status(),200);await page.getByRole('heading',{name:'From an unpublished idea to a testable plan',exact:true}).waitFor();assert.match(await page.locator('main').innerText(),/without a paper or DOI/);assert.match(await page.locator('main').innerText(),/not scientific validation/);assert.match(await page.locator('main').innerText(),/operator/);return {scientific_validation:'Separate from planning readiness',domain_execution:'Operator required'};});
 await check('desktop/mobile navigation and themes expose the idea entry point',async()=>{
  for(const width of [1365,390]){await page.setViewportSize({width,height:width===390?844:900});await page.goto(origin+base+'/methods',{waitUntil:'domcontentloaded'});
   for(const choice of ['Dark Mode','Light Mode']){
    if(width===390)await page.getByRole('button',{name:'Open module menu',exact:true}).click();
    const theme=page.getByRole('combobox',{name:'Theme',exact:true});await theme.click();
    await page.getByRole('option',{name:choice,exact:true}).click();
    await page.waitForFunction(dark=>document.documentElement.classList.contains('dark')===dark,choice==='Dark Mode');
    await page.getByRole('option',{name:choice,exact:true}).waitFor({state:'hidden'});
    if(width===390){
     const dialog=page.getByRole('dialog');
     await dialog.getByRole('link',{name:'Develop a Research Idea',exact:true}).waitFor();
     await dialog.getByRole('button',{name:'Close',exact:true}).click();
     await dialog.waitFor({state:'hidden'});
    }else await page.getByRole('link',{name:'Develop a Research Idea',exact:true}).waitFor();
    await page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'||!Number.isFinite(a.effect?.getComputedTiming().endTime)));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:directory+'/'+width+'-'+choice.replaceAll(' ','-')+'.png',fullPage:false});
   }
  }return {viewports:[1365,390],themes:['dark','light']};
 });
 await check('existing completed paper assessments remain publicly readable and exportable',async()=>{
  const result=await (await context.request.get('https://d3o7xdethb.execute-api.us-east-1.amazonaws.com/research/studies')).json();assert.ok(result.studies.length>0);const study=result.studies[0];await page.goto(origin+base+'/studies/'+study.id,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:study.title,exact:true}).waitFor();await page.getByRole('navigation',{name:'Study evidence',exact:true}).waitFor();
  const response=await context.request.get(origin+base+'/api/studies/'+study.id+'/export');assert.equal(response.status(),200);const raw=await response.body();await writeFile(directory+'/recorded-study-export.json',raw);const data=JSON.parse(raw);assert.equal(data.study.id,study.id);assert.ok(data.records.measurements.length>0);assert.equal(data.coverage.measurements,data.records.measurements.length);return {published_studies:result.studies.length,checked_study:study.id,measurement_rows:data.records.measurements.length,export_sha256:createHash('sha256').update(raw).digest('hex'),scope:'Existing archived/simulation assessments, no experiments rerun'};
 });
 assert.deepEqual(report.browser_errors,[]);report.passed=true;
}catch(error){report.passed=false;report.error=error.message;process.exitCode=1;if(browser){const p=browser.contexts()[0]?.pages()[0];if(p){await writeFile(directory+'/failure.html',await p.content());await p.screenshot({path:directory+'/failure.png',fullPage:false});}}}finally{if(browser)await browser.close();report.ended_at=new Date().toISOString();await writeFile(directory+'/validation-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({directory,passed:report.passed,error:report.error}));}
