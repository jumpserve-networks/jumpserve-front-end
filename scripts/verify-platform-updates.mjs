// Actual React component and built CSS on loopback. Auth/RPC/Realtime fixtures
// are synthetic; this is not a production Google OAuth or deployment test.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);const {build}=require('../../jumpserve-infra/node_modules/esbuild');
assert.equal(process.argv.length,2,'Fixed local verification only.');
const out='.test-artifacts/platform-browser/'+new Date().toISOString().replaceAll(':','-');await mkdir(out,{recursive:true});
const id='11111111-1111-4111-8111-111111111111', task='22222222-2222-4222-8222-222222222222';
const snapshot={version:'platform-supervisor-v1',operator_id:id,operator_role:'owner',settings:{paused:true,automatic_releases:true,worker_status:'ready',worker_reason:'Original task records retained.',worker_seen_at:null,authorization_version:'platform-supervisor-v1',revision:0},authorization:{version:'platform-supervisor-v1',policy_sha256:'a'.repeat(64),created_at:'2026-10-30T00:00:00Z'},tasks:[{id:task,title:'Preserve release identities',objective:'Private objective visible only to configured operators.',repositories:['jumpserve-networks/jumpserve-front-end'],status:'reconciling',reason:'Waiting for the original production verification receipt.',max_reserved_cents:10000,committed_cents:0,deadline_at:'2026-11-01T00:00:00Z',cancel_requested:false,authorization_version:'platform-supervisor-v1',created_at:'2026-10-30T00:00:00Z',updated_at:'2026-10-30T00:00:00Z'}],events:[{sequence:'9007199254740993',id,task_id:task,actor:'supervisor',kind:'operation-unknown',message:'Original release request retained. No duplicate deployment was started.',details:{operation_id:id,zero:0,unknown:null},created_at:'2026-10-30T00:00:00Z'}],changes:[],releases:[],runs:[],artifacts:[],has_more_tasks:false,has_more_events:false};
let bundle,css,loseAck=true,applications=0;const requests=new Map();const errors=[];const checks=[];
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle);}
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
 if(url.pathname==='/api/platform-updates'){
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'){
   let raw='';for await(const part of req)raw+=part;const control=JSON.parse(raw);
   if(!requests.has(control.request_id)){requests.set(control.request_id,control);applications++;if(control.action==='resume')snapshot.settings.paused=false;if(control.action==='pause')snapshot.settings.paused=true;if(control.action==='enqueue')snapshot.tasks.unshift({...snapshot.tasks[0],id:control.task_id,title:control.payload.title,objective:control.payload.objective,status:'queued'});}
   else assert.deepEqual(requests.get(control.request_id),control);
   if(loseAck){loseAck=false;res.writeHead(503);return res.end(JSON.stringify({error:'Synthetic gateway lost the acknowledgement after applying the request.'}));}return res.end(JSON.stringify({result:{recorded:true}}));
  }
  return res.end(JSON.stringify({status:'available',data:snapshot}));
 }
 if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
 if(url.pathname!== '/') {res.writeHead(404);return res.end();}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
let browser;
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
try{
 const files=await readdir('.next/static/chunks');css=(await Promise.all(files.filter(x=>x.endsWith('.css')).map(x=>readFile('.next/static/chunks/'+x,'utf8')))).join('\n');
 const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {PlatformUpdates} from './app/components/platform-updates';const mode=new URLSearchParams(location.search).get('mode');const data=${JSON.stringify(snapshot)};if(mode==='viewer')data.operator_role='viewer';const initial=mode==='denied'?{status:'forbidden',reason:'Your Google account is not a platform operator.'}:mode==='unavailable'?{status:'unavailable',reason:'The worker is reconnecting.'}:{status:'available',data};createRoot(document.getElementById('root')).render(<PlatformUpdates initial={initial} taskId={mode==='detail'?'${task}':undefined}/>);`,resolveDir:process.cwd(),sourcefile:'platform-fixture.tsx',loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'explicit-local-boundaries',setup(p){p.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));p.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'supabase',namespace:'fixture'}));p.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='link'?"import React from 'react';export default function Link(props){return React.createElement('a',props)}":"export function createClient(){return {channel(){return {on(){return this},subscribe(callback){queueMicrotask(()=>callback('CHANNEL_ERROR'));return this}}},removeChannel(){return Promise.resolve()}}}",loader:'js',resolveDir:process.cwd()}));}}]});bundle=result.outputFiles[0].contents;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin);await page.getByRole('heading',{name:'Platform Updates',exact:true}).waitFor();
 await check('desktop recorded status and polling fallback',async()=>{await page.getByText('Live stream reconnecting · polling active').waitFor();assert.equal(await page.getByText('$0.00 reserved').count(),1);await page.screenshot({path:out+'/desktop-light.png',fullPage:true});});
 await check('lost control response survives reload with its exact original request ID',async()=>{await page.getByRole('button',{name:'Resume new work',exact:true}).click();await page.getByRole('button',{name:'Reconcile original control request'}).waitFor();assert.equal(applications,1);await page.reload();await page.getByRole('button',{name:'Reconcile original control request'}).click();await page.getByRole('button',{name:'Pause new work',exact:true}).waitFor();assert.equal(applications,1);});
 await check('owner queues a bounded task through the private control endpoint',async()=>{await page.getByText('Queue a platform improvement',{exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('Improve bounded status polling');await page.getByLabel('Objective and acceptance criteria').fill('Retain requests and recorded verification.');await page.getByRole('button',{name:'Queue improvement',exact:true}).click();await page.getByRole('heading',{name:'Improve bounded status polling',exact:true}).waitFor();assert.equal(applications,2);});
 await check('mobile light/dark and detail have no horizontal overflow',async()=>{await page.setViewportSize({width:390,height:844});for(const mode of ['','?mode=detail']){await page.goto(origin+'/'+mode);await page.getByRole('heading',{level:1}).waitFor();for(const theme of ['light','dark']){await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),theme==='dark');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/mobile-'+(mode?'detail-':'')+theme+'.png',fullPage:true});}}});
 await check('unlisted and unavailable accounts do not render private task content',async()=>{for(const mode of ['denied','unavailable']){await page.goto(origin+'/?mode='+mode);await page.getByRole('heading',{name:mode==='denied'?'Platform operator access required':'Platform status unavailable'}).waitFor();assert.equal(await page.getByText('Private objective visible only to configured operators.').count(),0);await page.screenshot({path:out+'/'+mode+'.png',fullPage:true});}});
 await check('viewer can read records without owner controls',async()=>{await page.goto(origin+'/?mode=viewer');await page.getByRole('heading',{name:'Platform Updates',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/Pause new work|Resume new work/}).count(),0);assert.equal(await page.getByText('Queue a platform improvement',{exact:true}).count(),0);});
 assert.deepEqual(errors,[]);await context.close();
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(out+'/report.json',JSON.stringify({passed:checks.length===6&&errors.length===0,checks,page_errors:errors,operator_controls_applied:applications,production_writes:0,limitations:['Synthetic auth, API and Realtime boundaries; real component, browser and built CSS.','No production Google OAuth, AWS release or independent review.']},null,2)+'\n');console.log(out+'/report.json');}
