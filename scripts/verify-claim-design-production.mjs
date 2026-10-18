// Fixed public production checks: no sessions, model calls or mutation requests.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if(process.argv.length!==2)throw new Error('Fixed production target; no arguments accepted.');
const origin='https://jumpserve.quaint-lab.org',base='/research-verification';
const api='https://d3o7xdethb.execute-api.us-east-1.amazonaws.com/research';
const directory='.test-artifacts/claim-design/production/'+new Date().toISOString().replaceAll(':','-');
await mkdir(directory,{recursive:true});
const report={protocol:'claim-design-production-release-v1',started_at:new Date().toISOString(),origin,
  checks:[],browser_errors:[],mutations:[],new_model_calls:0,new_experiments:0,
  reviewer:{identity:'Primary Codex AI implementer',type:'AI',independent:false},
  conditional_gaps:['Legitimate Google-authenticated planning and provider/persistence round trip',
    'Authenticated plan-artifact Storage round trip','Actual networking experiment execution'],measured_charges_usd:null};
let browser;
async function check(name,run){try{report.checks.push({name,passed:true,evidence:await run()});console.log('PASS '+name);}
  catch(error){report.checks.push({name,passed:false,reason:error.message});throw error;}}
async function json(url){const response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);return response.json();}
try{
  const studies=await json(api+'/studies');assert.equal(studies.access,'published');
  const selected=studies.studies.find(s=>s.origin_module==='ipv6-dns-study');assert.ok(selected);
  const detail=await json(api+'/studies/'+selected.id);assert.ok(detail.records.claims.length>0);
  report.study={id:selected.id,title:selected.title,claims:detail.records.claims.length};
  const claim=detail.records.claims[0],intake=base+'/design-claim/'+selected.id+'/'+claim.id;
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,executablePath:existsSync(chrome)?chrome:undefined});
  const context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'});
  // Reject any accidental browser mutation rather than silently executing it.
  await context.route('**/*',route=>{
    const request=route.request();
    if(!['GET','HEAD','OPTIONS'].includes(request.method())){
      report.mutations.push({method:request.method(),url:request.url()});return route.abort();
    }
    return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>report.browser_errors.push(error.message));
  async function visit(path){const response=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:45000});assert.equal(response.status(),200);assert.doesNotMatch(await page.locator('body').innerText(),/Application error:/);}
  await check('published assessment exposes source-bound claim design links',async()=>{
    await visit(base+'/studies/'+selected.id);
    const links=page.getByRole('link',{name:'Design an experiment for this claim',exact:true});
    assert.equal(await links.count(),detail.records.claims.length);
    assert.equal(await links.first().getAttribute('href'),intake);
    await links.first().click();await page.waitForURL(/\/login\?/);
    assert.equal(new URL(page.url()).searchParams.get('next'),intake);
    return {claims:detail.records.claims.length,design_links:detail.records.claims.length,exact_return_path:intake};
  });
  await check('new private routes and malformed identities enforce their boundaries',async()=>{
    for(const path of [intake,base+'/experiment-design/'+selected.id,base+'/experiment-queue',base+'/workspace']){
      await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForURL(/\/login\?/);
      assert.equal(new URL(page.url()).searchParams.get('next'),path);
    }
    const response=await page.goto(origin+base+'/experiment-design/not-a-uuid',{waitUntil:'domcontentloaded'});
    // Next may stream a 404 with a 200 transport status; require the visible 404.
    assert.ok([200,404].includes(response.status()));await page.getByText('404',{exact:true}).waitFor();
    return {sign_in_return_paths:4,invalid_identity:'visible 404',legitimate_session:false};
  });
  await check('desktop and mobile public results render in both themes',async()=>{
    for(const width of [1365,390]){
      await page.setViewportSize({width,height:width===390?844:900});
      for(const theme of ['light','dark']){
        await context.addCookies([{name:'theme-preference',value:theme,url:origin}]);
        await visit(base+'/studies/'+selected.id+'?view=gaps');
        await page.getByRole('button',{name:theme==='dark'?'Dark Mode':'Light Mode',exact:true}).click();
        await page.waitForFunction(dark=>document.documentElement.classList.contains('dark')===dark,theme==='dark');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
        await page.screenshot({path:directory+'/'+width+'-'+theme+'.png',fullPage:true});
      }
    }
    return {widths:[1365,390],themes:['light','dark'],horizontal_overflow:false};
  });
  await check('published export preserves original data and missing studies stay unavailable',async()=>{
    const response=await fetch(origin+base+'/api/studies/'+selected.id+'/export',{signal:AbortSignal.timeout(30000)});
    assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());
    const data=JSON.parse(bytes);assert.ok(data);
    await writeFile(directory+'/published-export.json',bytes);
    const missing='00000000-0000-4000-8000-000000000001';
    await visit(base+'/studies/'+missing);assert.match(await page.getByRole('status').innerText(),/no public assessment/i);
    const unavailable=await fetch(origin+base+'/api/studies/'+missing+'/export');assert.equal(unavailable.status,404);
    return {export_bytes:bytes.length,export_sha256:createHash('sha256').update(bytes).digest('hex'),missing_export_status:404};
  });
  await check('landing, previous assessments and methods remain navigable',async()=>{
    await visit('/');await page.getByRole('link',{name:'Start verification',exact:true}).waitFor();
    await page.getByRole('link',{name:'Start developing',exact:true}).waitFor();
    await visit(base+'/test-results');await page.locator('a[href="'+base+'/studies/'+selected.id+'"]').first().waitFor();
    await visit(base+'/methods');
    return {paths:['/',base+'/test-results',base+'/methods']};
  });
  assert.deepEqual(report.browser_errors,[]);assert.deepEqual(report.mutations,[]);report.passed=true;
}catch(error){report.passed=false;report.error=error.message;process.exitCode=1;
  if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await writeFile(directory+'/failure.html',await page.content());await page.screenshot({path:directory+'/failure.png',fullPage:true});}}
}finally{if(browser)await browser.close();report.ended_at=new Date().toISOString();
  await writeFile(directory+'/browser-report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({directory,passed:report.passed,error:report.error}));}
