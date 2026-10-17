// Fixed five-study historical import verification. No credentials or writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const {build}=require('../../jumpserve-infra/node_modules/esbuild');
const production=process.argv.slice(2).length===1&&process.argv[2]==='--production';
if(process.argv.slice(2).length&&!production)throw new Error('Only fixed public --production verification is supported.');
const input='../jumpserve-infra/.test-artifacts/archived-assessments-v1';
const manifest=JSON.parse(await readFile(input+'/prepared-manifest-v3.json','utf8'));
assert.equal(manifest.studies.length,5);
const candidates=await Promise.all(manifest.studies.map(async item=>{
 const data=JSON.parse(await readFile(input+'/'+item.prepared_path,'utf8'));
 const rows=Object.fromEntries(['sources','claims','protocols','configurations','campaigns','claim_checks','runs','published_values','measurements','summaries','assessments','gaps','reviews','publications'].map(kind=>[kind,[]]));
 const stamp=data.records.find(e=>e.kind==='runs').record.started_at;
 for(const entry of data.records)rows[entry.kind].push({...entry.record,study_id:data.study_id,created_at:stamp});
 return {item,data,snapshot:{study:{id:data.study_id,...data.paper,created_at:stamp},access:'owner-draft',records:rows,coverage:Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.length]))}};
}));
const directory='.test-artifacts/archived-assessments/'+new Date().toISOString().replaceAll(':','-');await mkdir(directory,{recursive:true});
const report={protocol:'archived-assessment-import-protocol-v1',mode:production?'public production':'exact prepared component preview',started_at:new Date().toISOString(),reviewer:{identity:'Codex AI integration implementer',type:'AI',independence:'Not independent or human review'},checks:[],errors:[],browser_errors:[],conditional_gaps:['No legitimate Google browser session or provider round trip','Historical experiments not rerun or independently scientifically validated'],measured_charges_usd:null,model_usage:null};
let server,browser;
try{
 let origin='https://jumpserve.quaint-lab.org';
 if(!production){
  const payload=JSON.stringify(candidates.map(c=>c.snapshot));
  const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {StudyPanel} from './app/components/research-workflow/study-panel';const candidates=${payload};const params=new URLSearchParams(location.search);const snapshot=candidates.find(c=>c.study.id===params.get('study'));if(!snapshot)throw new Error('Fixed prepared study required');createRoot(document.getElementById('root')).render(React.createElement(StudyPanel,{snapshot,view:params.get('view')||'results',basePath:'/?study='+snapshot.study.id}));`,resolveDir:process.cwd(),sourcefile:'archived-assessment-preview.tsx',loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolated-link-renderer',setup(plugin){plugin.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'preview'}));plugin.onLoad({filter:/.*/,namespace:'preview'},()=>({contents:"import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}",loader:'js',resolveDir:process.cwd()}));}}]});
  const cssNames=(await readdir('.next/static/chunks')).filter(n=>n.endsWith('.css'));assert.ok(cssNames.length);
  const css=(await Promise.all(cssNames.map(n=>readFile('.next/static/chunks/'+n,'utf8')))).join('\n');
  const html='<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style><style>body{padding:16px}#root{max-width:1000px;margin:auto}</style></head><body><div id="root"></div><script src="/preview.js"></script></body></html>';
  server=createServer((req,res)=>{if(req.url==='/preview.js'){res.writeHead(200,{'Content-Type':'application/javascript'});res.end(bundle.outputFiles[0].text);}else{res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
 }
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,executablePath:existsSync(chrome)?chrome:undefined});
 const context=await browser.newContext({viewport:{width:1365,height:900}});
 if(!production)await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.browser_errors.push(e.message));
 if(production){const response=await page.goto(origin+'/module/research-verification/test-results',{waitUntil:'domcontentloaded',timeout:60000});assert.equal(response.status(),200);for(const c of candidates)await page.getByRole('link',{name:c.data.paper.title,exact:true}).waitFor();report.checks.push({name:'Production catalogue contains all five imported assessments',passed:true});}
 for(const c of candidates){
  const url=view=>production?origin+'/module/research-verification/studies/'+c.data.study_id+'?view='+view:origin+'/?study='+c.data.study_id+'&view='+view;
  for(const view of ['results','methods','literature','gaps']){
   const response=await page.goto(url(view),{waitUntil:'domcontentloaded',timeout:60000});assert.equal(response.status(),200);
   await page.getByText(/Imported historical assessment completed outside the web application/).first().waitFor();
   assert.ok(!(await page.locator('body').innerText()).includes('Application error:'));
   if(view==='results'){
    const coverage=page.locator('[aria-label="Current claim coverage"]');await coverage.waitFor();
    const text=await coverage.innerText();for(const [label,count] of Object.entries(c.item.labels))assert.match(text,new RegExp(label+'\\s+'+count,'i'));
    assert.ok(await page.getByRole('img').count()>0,'Recorded numerical chart must render');
   }
   report.checks.push({name:c.item.module+' '+view,passed:true});
  }
  await page.goto(url('results'),{waitUntil:'domcontentloaded',timeout:60000});
  for(const width of [1365,390])for(const dark of [false,true]){
   await page.setViewportSize({width,height:width===390?844:900});
   await page.evaluate(value=>{localStorage.setItem('jumpserve-theme',value?'dark':'light');document.documentElement.classList.toggle('dark',value);},dark);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Body must fit viewport');
   await page.screenshot({path:directory+'/'+c.item.module+'-'+width+'-'+(dark?'dark':'light')+'.png',fullPage:false});
  }
  if(production){
   const response=await context.request.get(origin+'/module/research-verification/api/studies/'+c.data.study_id+'/export');assert.equal(response.status(),200);const snapshot=await response.json();
   for(const [kind,count] of Object.entries(c.item.coverage))assert.equal(snapshot.coverage[kind],count);
   const csv=await context.request.get(origin+'/module/research-verification/api/studies/'+c.data.study_id+'/export?format=csv');assert.equal(csv.status(),200);assert.equal((await csv.text()).trim().split('\n').length,c.item.coverage.measurements+1);
   report.checks.push({name:c.item.module+' complete shared JSON/CSV exports',passed:true,scope:'Aggregate/key result projection; original detailed records linked separately.'});
  }
 }
 assert.deepEqual(report.browser_errors,[]);report.passed=true;
}catch(error){report.passed=false;report.errors.push(error.message);process.exitCode=1;}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));report.ended_at=new Date().toISOString();await writeFile(directory+'/browser-report.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,report_file:directory+'/browser-report.json'},null,2));}
