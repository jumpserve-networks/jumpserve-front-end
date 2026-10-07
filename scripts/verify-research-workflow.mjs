import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
const origin='http://localhost:3004', path='/module/research-verification';
const ipv6='953f20a3-3fd8-4fb4-8844-5d4d72690e01', numeric='953f20a3-3fd8-4fb4-8844-5d4d72690e10';
const directory='.test-artifacts/research-workflow';await mkdir(directory,{recursive:true});
const intakeOnly=process.argv.slice(2).includes('--intake');
if(process.argv.slice(2).some(arg=>arg!=='--intake'))throw new Error('Only the fixed --intake verification subset is supported.');
const stamp=new Date().toISOString().replaceAll(':','-');
const report={version:1,started_at:new Date().toISOString(),origin,design:'Development checks; actual public backend and isolated Postgres anon RLS via test-only SQL transport. Synthetic numerical/review fixtures are not scientific validation.',reviewer:{identity:'Primary Codex implementer',type:'AI',independence:'Not independent'},checks:[],errors:[],browser_errors:[],conditional_gaps:['No legitimate Google session or authenticated owner/chat request','No production deployment or remote Supabase Storage verification']};
if(intakeOnly)report.design='Development browser checks of the actual preparation display on a labeled synthetic empty-study example and real sign-in return paths. No database fixture, owner identity, API mutation or scientific assessment is simulated.';
async function check(name,action){if(intakeOnly&&!['unprepared study explains why no jobs start','sign-in return paths preserve owner study view'].includes(name))return;try{report.checks.push({name,passed:true,evidence:await action()});console.log('PASS '+name);}catch(error){report.errors.push({name,reason:error.message});throw error;}}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
let browser;
try {
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,timeout:15000,executablePath:existsSync(chrome)?chrome:undefined});
  const context=await browser.newContext({viewport:{width:1365,height:900},colorScheme:'light'});
  const page=await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror',error=>report.browser_errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.browser_errors.push(message.text());});
  async function visit(suffix){const response=await page.goto(origin+path+suffix,{waitUntil:'domcontentloaded',timeout:30000});assert.equal(response.status(),200);assert.ok(!(await page.locator('body').innerText()).includes('Application error:'));}
  async function select(label,text){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:text,exact:true}).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-slot="select-content"]')).every(element=>{const style=getComputedStyle(element);return style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||element.getBoundingClientRect().height===0;}));}
  await check('unprepared study explains why no jobs start',async()=>{
    await visit('/methods');await page.getByText('Explore an illustrative claim queue',{exact:true}).click();await select('Queue example state','New study awaiting preparation');
    const preparation=page.getByRole('region',{name:'Assessment preparation'});
    await preparation.getByRole('heading',{name:'Assessment preparation required'}).waitFor();
    assert.match(await preparation.innerText(),/available source-grounded plan and enqueue its campaigns/);
    assert.match(await preparation.innerText(),/Next step: add sources/);assert.equal(await preparation.locator('ol > li').count(),6);
    assert.equal(await page.getByTestId('claim-queue').locator('tbody tr').count(),0);assert.match(await page.getByTestId('claim-queue').innerText(),/No jobs queued/);
    for(const width of [1365,390]){
      await page.setViewportSize({width,height:width===390?844:900});
      for(const theme of ['Light Mode','Dark Mode']){
        if(width===390)await page.getByRole('button',{name:'Open module menu',exact:true}).click();await select('Theme',theme);
        if(width===390){await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('[data-slot="sheet-content"]').waitFor({state:'hidden'});}
        await page.waitForFunction(dark=>document.documentElement.classList.contains('dark')===dark,theme==='Dark Mode');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
        await preparation.evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 90));
        await page.screenshot({path:`${directory}/${stamp}-preparation-${width}-${theme==='Dark Mode'?'dark':'light'}.png`,fullPage:false});
      }
    }
    return {origin:'Synthetic teaching fixture with the actual preparation display; not an authenticated owner request',claims:0,jobs:0,missing_setup_steps:6,viewports:[1365,390],themes:['light','dark'],owner_preparation_not_verified_by_this_case:true};
  });
  await check('public module navigation and study listing',async()=>{await visit('');await page.getByRole('link',{name:'Published Assessments',exact:true}).first().click();await page.waitForURL('**/test-results');await page.getByRole('link',{name:/How I learned/}).waitFor();return {studies:2};});
  await check('real IPv6 imported claim coverage and nine gaps',async()=>{await visit('/studies/'+ipv6);const text=await page.getByRole('region',{name:'Current claim coverage'}).innerText().catch(()=>page.locator('[aria-label="Current claim coverage"]').innerText());assert.match(text,/Reproduced\s+3/);assert.match(text,/Discrepant\s+3/);assert.match(text,/Inconclusive\s+5/);assert.match(text,/Untested\s+4/);await page.getByRole('link',{name:'Evidence gaps & next experiments',exact:true}).click();await page.getByRole('heading',{name:'Evidence gaps and next experiments',exact:true}).waitFor();assert.equal(await page.locator('article[id^="gap-"]').count(),9);await page.screenshot({path:`${directory}/${stamp}-desktop-ipv6-gaps.png`,fullPage:false});return {sources:74,claims:15,reproduced:3,discrepant:3,inconclusive:5,untested:4,gaps:9,scientific_labels_changed:false};});
  await check('literature versions hashes omissions and protocol limits',async()=>{await visit('/studies/'+ipv6+'?view=literature');assert.equal(await page.locator('main article').count(),74);await page.getByText('Reported original-byte SHA256:',{exact:false}).first().waitFor();await visit('/studies/'+ipv6+'?view=methods');await page.getByText('No shared-workflow protocol frozen.',{exact:false}).waitFor();return {literature_records:74,import_is_register_only:true};});
  await check('synthetic numerical states plots and configuration filter',async()=>{await visit('/studies/'+numeric);assert.equal(await page.locator('tbody tr').count(),7);await page.getByRole('img',{name:'Published and reproduced values for latency / ms'}).waitFor();const text=await page.locator('main').innerText();assert.match(text,/Planned 6 · unexpected 1 · recorded 2 · missing 1 · invalid 1 · ambiguous 1 · excluded 2/);assert.match(text,/not confidence intervals/);assert.equal(await page.locator('tbody tr').filter({hasText:'fixture-0'}).locator('td').nth(4).innerText(),'0');await select('Configuration','B');assert.equal(await page.locator('tbody tr').count(),1);assert.match(await page.locator('tbody').innerText(),/unexpected/);await select('Configuration','All configurations');assert.equal(await page.locator('tbody tr').count(),7);await page.screenshot({path:`${directory}/${stamp}-desktop-comparisons-light.png`,fullPage:false});return {planned:6,unexpected:1,non_recorded:5,chart:'Descriptive unconnected points, no confidence interval',filtered_rows:1};});
  await check('complete public exports preserve null zero identity and privacy',async()=>{const endpoint=origin+path+'/api/studies/';const response=await fetch(endpoint+ipv6+'/export');assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer()),data=JSON.parse(bytes);assert.equal(data.records.sources.length,74);assert.equal(data.records.claims.length,15);assert.equal(data.records.gaps.length,9);for(const key of ['artifacts','study_owners','audit_events'])assert.ok(!(key in data.records));await writeFile(`${directory}/${stamp}-ipv6-public.json`,bytes);const numbers=await fetch(endpoint+numeric+'/export');assert.equal(numbers.status,200);const n=await numbers.json();assert.equal(n.records.measurements.filter(row=>row.value===null).length,5);assert.equal(Number(n.records.measurements.find(row=>row.observation_id==='fixture-0').value),0);const csvResponse=await fetch(endpoint+numeric+'/export?format=csv');assert.equal(csvResponse.status,200);const csv=await csvResponse.text();assert.match(csv,/"recorded","0",/);assert.match(csv,/"missing",,"/);assert.equal((await fetch(endpoint+numeric+'/export?format=invalid')).status,400);const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Download measurements CSV',exact:true}).click();const download=await downloadPromise;const downloaded=await readFile(await download.path());assert.equal(digest(downloaded),digest(csv));return {json_sha256:digest(bytes),json_bytes:bytes.length,csv_sha256:digest(csv),measurements:7,download_sha_verified:true,private_records_exposed:false};});
  await check('desktop dark theme and bounded horizontal layout',async()=>{await select('Theme','Dark Mode');await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.waitForFunction(()=>getComputedStyle(document.body).color==='rgb(229, 237, 247)');await page.locator('figure').first().screenshot({path:`${directory}/${stamp}-desktop-plot-dark.png`});await page.screenshot({path:`${directory}/${stamp}-desktop-comparisons-dark.png`,fullPage:false});return {viewport:{width:1365,height:900},theme:'dark'};});
  await check('mobile navigation themes tables and exports',async()=>{await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open module menu',exact:true}).click();await select('Theme','Light Mode');await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('[data-slot="sheet-content"]').waitFor({state:'hidden'});await page.waitForFunction(()=>!document.documentElement.classList.contains('dark'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.getByRole('img',{name:'Published and reproduced values for latency / ms'}).waitFor();await page.locator('figure').first().screenshot({path:`${directory}/${stamp}-mobile-plot-light.png`});await page.screenshot({path:`${directory}/${stamp}-mobile-comparisons-light.png`,fullPage:false});await page.getByRole('button',{name:'Open module menu',exact:true}).click();await select('Theme','Dark Mode');await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('[data-slot="sheet-content"]').waitFor({state:'hidden'});await page.waitForFunction(()=>getComputedStyle(document.body).color==='rgb(229, 237, 247)');await page.locator('figure').first().screenshot({path:`${directory}/${stamp}-mobile-plot-dark.png`});await page.screenshot({path:`${directory}/${stamp}-mobile-comparisons-dark.png`,fullPage:false});return {viewport:{width:390,height:844},themes:['light','dark'],body_overflow:false};});
  await check('missing invalid and unavailable results do not become zero coverage',async()=>{for(const [id,pattern] of [['953f20a3-3fd8-4fb4-8844-5d4d72690e97',/no public assessment/],['953f20a3-3fd8-4fb4-8844-5d4d72690e98',/incomplete or invalid coverage/],['953f20a3-3fd8-4fb4-8844-5d4d72690e99',/HTTP 503/]]){await visit('/studies/'+id);assert.match(await page.getByRole('status').innerText(),pattern);assert.equal(await page.locator('[aria-label="Current claim coverage"]').count(),0);}return {states:['missing','invalid snapshot (injected transport fixture)','unavailable (injected transport fixture)'],zero_fill:false};});
  await check('sign-in return paths preserve owner study view',async()=>{for(const suffix of ['/new-study','/workspace/'+ipv6+'?view=gaps']){await page.goto(origin+path+suffix,{waitUntil:'domcontentloaded'});const url=new URL(page.url());assert.equal(url.pathname,'/login');assert.equal(url.searchParams.get('next'),path+suffix);}return {google_flow:'Return paths checked; actual provider sign-in and owner writes conditional'};});
  await check('claim queue teaching fixture preserves separate assessments dependencies and event export',async()=>{
    await page.setViewportSize({width:1365,height:900});await visit('/methods');
    await page.getByText('Explore an illustrative claim queue',{exact:true}).click();
    const queue=page.getByTestId('claim-queue');await queue.waitFor();
    assert.equal(await queue.locator('tbody tr').count(),6);
    assert.equal(await queue.locator('tbody tr').filter({hasText:'Untested'}).count(),6);
    assert.equal(await queue.locator('article').count(),5);
    assert.match(await queue.innerText(),/reviewed evidence/);assert.match(await queue.innerText(),/global limit 4/);
    assert.match(await queue.innerText(),/Scheduled workers are disabled/);
    await queue.getByText(/Recorded event history/).click();assert.equal(await queue.locator('ol > li').count(),5);
    const pending=page.waitForEvent('download');await queue.getByRole('button',{name:'Download private queue history'}).click();
    const download=await pending;const raw=await readFile(await download.path());const data=JSON.parse(raw);
    assert.equal(data.coverage.jobs,5);assert.equal(data.coverage.events,5);assert.equal(data.events[0].details.data_origin,'software-fixture');assert.equal(data.events[0].details.measured_charges_usd,null);
    await page.screenshot({path:`${directory}/${stamp}-desktop-queue-example.png`,fullPage:true});
    return {origin:'Synthetic teaching fixture; same queue display component, no authenticated owner request',claims:6,jobs:5,scientific_assessments_untested:6,download_sha256:digest(raw),live_workers:false};
  });
  await check('mobile queue empty and unavailable states remain distinct in light and dark themes',async()=>{
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await select('Queue example state','Claims with no queued jobs');
    assert.equal(await page.getByTestId('claim-queue').locator('tbody tr').count(),6);
    assert.match(await page.getByTestId('claim-queue').innerText(),/No jobs queued/);
    await select('Queue example state','Queue unavailable');
    assert.equal(await page.getByTestId('claim-queue').count(),0);assert.match(await page.getByTestId('queue-example').getByRole('alert').innerText(),/unknown/);
    await select('Queue example state','Mixed work and blocked prerequisites');
    for(const theme of ['Light Mode','Dark Mode']){
      await page.getByRole('button',{name:'Open module menu',exact:true}).click();await select('Theme',theme);
      await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('[data-slot="sheet-content"]').waitFor({state:'hidden'});
      await page.waitForFunction(dark=>document.documentElement.classList.contains('dark')===dark,theme==='Dark Mode');
      await page.getByTestId('queue-example').screenshot({path:`${directory}/${stamp}-mobile-queue-${theme==='Dark Mode'?'dark':'light'}.png`});
    }
    return {viewport:{width:390,height:844},states:['mixed','empty','unavailable'],themes:['light','dark'],authenticated_owner_controls:'conditional; legitimate session unavailable'};
  });
  assert.deepEqual(report.browser_errors,[]);
} catch(error) { if(!report.errors.some(item=>item.reason===error.message))report.errors.push({name:'browser setup or runtime',reason:error.message}); }
finally { if(browser)await browser.close();report.ended_at=new Date().toISOString();report.passed=report.errors.length===0&&report.browser_errors.length===0;await writeFile(`${directory}/${stamp}-browser-report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1; }
