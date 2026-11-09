import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
const auth='data:text/javascript,'+encodeURIComponent('export async function requireAccessToken(message,userId){globalThis.catalogAuthCalls.push({message,userId});return "synthetic-test-token";}');
globalThis.catalogAuthCalls=[];
const hook=registerHooks({resolve(s,c,next){return next(s==='@/lib/browser-auth'?auth:s.startsWith('@/lib/')?new URL('../lib/'+s.slice(6)+'.ts',import.meta.url).href:s,c);}});
const {validatePaperCatalog,loadPaperCatalog,loadMyPaperCatalog,loadPaperMetadata,loadPaperDetail,paperWorkflowLabel}=await import('../lib/research-paper-catalog.ts');
const {assessmentListPath,loadAssessmentList}=await import('../lib/research-assessment-list.ts');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';
function fixture(){return {version:'research-paper-catalog-v1',access:'public-read-only',papers:[{id,title:null,created_at:'2026-10-22T00:00:00Z',workflow_status:'budget',published:false}],coverage:{papers:1},next_cursor:null};}

test('duplicate paper identities remain invalid even when the declared coverage count matches',()=>{
 const value=fixture();value.papers.push({...value.papers[0]});value.coverage.papers=2;assert.throws(()=>validatePaperCatalog(value),/invalid or incomplete/);
 for(const status of ['running','completed','completed-with-blockers','budget','deadline','cancelled',null])assert.ok(paperWorkflowLabel(status).length>0);
});

test('unconfigured and missing catalogue endpoints retain explicit diagnostics across configured API fallbacks',async t=>{
 const names=['NEXT_PUBLIC_RESEARCH_CATALOG_API_URL','NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL','NEXT_PUBLIC_BENCHMARK_API_URL'];const originals=names.map(name=>process.env[name]);t.after(()=>names.forEach((name,index)=>{if(originals[index]===undefined)delete process.env[name];else process.env[name]=originals[index];}));for(const name of names)delete process.env[name];
 await assert.rejects(()=>loadPaperCatalog(undefined,undefined,()=>assert.fail('No request permitted')),/not configured/);
 process.env.NEXT_PUBLIC_BENCHMARK_API_URL='https://fallback.example.test';
 await assert.rejects(()=>loadPaperCatalog(undefined,undefined,async()=>new Response('',{status:404})),/has not been released/);
 await assert.rejects(()=>loadPaperMetadata('invalid',undefined,()=>assert.fail('No request permitted')),/identity is invalid/);
});

test('personal lists reject repeated cross-page papers and a nonadvancing owner cursor',async t=>{
 const original=process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;t.after(()=>{if(original===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL=original;});process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL='https://catalog.example.test';
 const papers=Array.from({length:10},(_,index)=>({...fixture().papers[0],id:'40000000-0000-4000-8000-'+String(index).padStart(12,'0')}));
 const full={...fixture(),papers,coverage:{papers:10},next_cursor:'same'};
 await assert.rejects(()=>loadMyPaperCatalog(id,'same',undefined,async()=>Response.json({...full,access:'owner-read-only'})),/invalid or incomplete/);
 await assert.rejects(()=>loadMyPaperCatalog(id,undefined,undefined,async url=>new URL(url).pathname.endsWith('/studies')?Response.json({access:'owner-drafts',studies:[{id,study_kind:'paper'}]}):Response.json(full)),/invalid or incomplete/);
 const controller=new AbortController();await assert.rejects(()=>loadMyPaperCatalog(id,undefined,controller.signal,async()=>{controller.abort(new Error('Original personal-list cancellation'));return Response.json(full);}),/Original personal-list cancellation/);
});
test('legacy personal catalogues reject a repeated paper even when the public cursor keeps advancing',async t=>{
 const original=process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;t.after(()=>{if(original===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL=original;});process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL='https://catalog.example.test';let pages=0;const missing='60000000-0000-4000-8000-000000000001';await assert.rejects(loadMyPaperCatalog(id,undefined,undefined,async url=>new URL(url).pathname.endsWith('/studies')?Response.json({access:'owner-drafts',studies:[{id:missing,study_kind:'paper'}]}):Response.json({...fixture(),papers:Array.from({length:10},(_,index)=>({...fixture().papers[0],id:'80000000-0000-4000-8000-'+String(index).padStart(12,'0')})),coverage:{papers:10},next_cursor:'page-'+(++pages)})),/invalid or incomplete/);assert.equal(pages,2);
});

test('name search rejects repeated inventories and cursor cycles and relays in-flight cancellation',async t=>{
 const original=process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;t.after(()=>{if(original===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL=original;});process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL='https://catalog.example.test';
 let page=0;const catalogue=fresh=>{page++;return {...fixture(),papers:Array.from({length:10},(_,index)=>({...fixture().papers[0],id:'50000000-0000-4000-8000-'+String(index+(fresh?page*10:0)).padStart(12,'0'),title:'Other paper',authors:['Known Author']})),coverage:{papers:10},next_cursor:'cursor-'+(fresh?page%2:page)};};
 for(const fresh of [false,true]){page=0;await assert.rejects(()=>loadAssessmentList({name:'unmatched'},undefined,async()=>Response.json(catalogue(fresh))),/repeated a page/);assert.equal(page,fresh?3:2);}
 page=0;await assert.rejects(()=>loadAssessmentList({name:'unmatched'},undefined,async()=>{const result=catalogue(true);result.next_cursor='page-'+page;return Response.json(result);}),/lookup limit/);assert.equal(page,100);
 assert.equal((await loadAssessmentList({name:'   '},undefined,async()=>Response.json(fixture()))).papers.length,1);
 const controller=new AbortController();await assert.rejects(()=>loadAssessmentList({name:'unmatched'},controller.signal,async(_url,options)=>{controller.abort(new Error('Original name-filter cancellation'));assert.equal(options.signal.aborted,true);throw options.signal.reason;}),/Original name-filter cancellation/);
});

test('legacy personal catalog scanning stops at its complete-page bound without claiming an empty owner list',async t=>{
 const previous=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;t.after(()=>{if(previous===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=previous;});process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://example.test';let pages=0;const fetcher=async url=>{if(new URL(url).pathname.endsWith('/studies'))return Response.json({access:'owner-drafts',studies:[{id,study_kind:'paper'}]});pages++;const papers=Array.from({length:10},(_,index)=>({...fixture().papers[0],id:'30000000-0000-4000-8000-'+String(pages*10+index).padStart(12,'0'),created_at:new Date(Date.UTC(2026,10,1)-(pages*10+index)*1000).toISOString()}));const paper=papers.at(-1);return Response.json({...fixture(),papers,coverage:{papers:10},next_cursor:Buffer.from(JSON.stringify({created_at:paper.created_at,id:paper.id})).toString('base64url')});};await assert.rejects(loadMyPaperCatalog(id,undefined,undefined,fetcher),/No partial list is shown/);assert.equal(pages,101);
});

test('assessment view, name and ownership filters survive page links and encode names safely',()=>{
 const path=assessmentListPath({mine:true,view:'card',name:'  A&B / ?  ',before:'abc'}),url=new URL(path,'https://example.org');
 assert.equal(url.pathname,'/research-verification/assessments');assert.equal(url.searchParams.get('mine'),'1');assert.equal(url.searchParams.get('view'),'card');assert.equal(url.searchParams.get('name'),'A&B / ?');assert.equal(url.searchParams.get('before'),'abc');
 assert.equal(assessmentListPath(),'/research-verification/assessments');
 assert.equal(assessmentListPath({view:'table'}),'/research-verification/assessments');
});

test('name filtering crosses catalogue pages without skipping matching lookahead or mixing owner scope',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 const papers=Array.from({length:49},(_,i)=>({...fixture().papers[0],id:`30000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,title:i%2===0?'Signal paper '+i:'Other paper '+i,authors:[i===31?'Ada Lovelace':'Generic Author'],initiated_by:i===33?'Zoë Researcher':null,created_at:new Date(Date.UTC(2026,10,1)-i*1000).toISOString()}));
 const encode=paper=>Buffer.from(JSON.stringify({created_at:paper.created_at,id:paper.id})).toString('base64url');
 const owned=new Set(papers.filter((_,i)=>i%3===0).map(p=>p.id));let reads=0;
 const fetcher=async(url,options)=>{
  const u=new URL(url);assert.equal(u.pathname,'/research/papers');reads++;
  const mine=u.searchParams.get('mine')==='1';assert.equal(options.headers.Authorization,mine?'Bearer synthetic-test-token':undefined);
  const before=u.searchParams.get('before'),boundary=before?JSON.parse(Buffer.from(before,'base64url').toString()):null;
  const remaining=papers.filter(p=>(!mine||owned.has(p.id))&&(!boundary||p.created_at<boundary.created_at));
  const selected=remaining.slice(0,10);return Response.json({...fixture(),access:mine?'owner-read-only':'public-read-only',papers:selected,coverage:{papers:selected.length},next_cursor:remaining.length>10?encode(selected.at(-1)):null});
 };
 try{
  let before,seen=[];
  do{const page=await loadAssessmentList({name:'sIgNaL',before},undefined,fetcher);seen.push(...page.papers.map(p=>p.id));before=page.next_cursor??undefined;}while(before);
  assert.deepEqual(seen,papers.filter((_,i)=>i%2===0).map(p=>p.id));assert.ok(reads>3);
  const author=await loadAssessmentList({name:'ada'},undefined,fetcher);assert.equal(author.papers[0].id,papers[31].id);
  const initiator=await loadAssessmentList({name:'zoe'},undefined,fetcher);assert.equal(initiator.papers[0].id,papers[33].id);
  const mine=await loadAssessmentList({name:'signal',userId:id},undefined,fetcher);assert.equal(mine.access,'owner-read-only');assert.ok(mine.papers.every(p=>owned.has(p.id)));assert.equal(mine.papers.length,9);
  assert.equal((await loadAssessmentList({name:'absent-name'},undefined,fetcher)).papers.length,0);
  const cancelled=new AbortController();cancelled.abort(new Error('Cancelled'));await assert.rejects(()=>loadAssessmentList({name:'signal'},cancelled.signal,()=>assert.fail('No request')),/Cancelled/);
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=old;}
});

test('name filtering resolves missing bibliography and reports failures instead of false empty results',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 try{
  const fetcher=async url=>url.includes('/title?')?Response.json({version:'research-paper-catalog-v1',access:'public-read-only',id,title:'Legacy Latency Paper',authors:['Åda Source']}):Response.json(fixture());
  const result=await loadAssessmentList({name:'ada'},undefined,fetcher);assert.equal(result.papers[0].title,'Legacy Latency Paper');assert.deepEqual(result.papers[0].authors,['Åda Source']);
  await assert.rejects(()=>loadAssessmentList({name:'ada'},undefined,async url=>url.includes('/title?')?new Response('{}',{status:503}):Response.json(fixture())),/retrieval failed/);
  await assert.rejects(()=>loadAssessmentList({name:'x'.repeat(201)},undefined,()=>assert.fail('No request')),/200 characters/);
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=old;}
});
test('unpublished paper metadata and null titles remain distinct from published results',()=>{
 const q=validatePaperCatalog(fixture());assert.equal(q.papers[0].title,null);assert.equal(q.papers[0].published,false);
 assert.equal(paperWorkflowLabel('budget'),'Spending limit reached');assert.equal(paperWorkflowLabel('completed-with-blockers'),'Finished with gaps');assert.equal(paperWorkflowLabel(null),'Submitted');
});
test('private fields, duplicate identities, invalid states and incorrect coverage fail closed',()=>{
 for(const change of [q=>q.owner_id='private',q=>q.papers[0].paper_upload='private',q=>q.papers.push(q.papers[0]),q=>q.coverage.papers=0,q=>q.papers[0].workflow_status='reproduced',q=>q.next_cursor='abc',q=>q.papers[0].created_at='bad']){
  const q=fixture();change(q);assert.throws(()=>validatePaperCatalog(q),/invalid or incomplete/);
 }
});
test('public catalogue reads never send credentials',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 try{
  const seen=[];const fetcher=async(url,options)=>{seen.push(url);assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,undefined);return Response.json(fixture());};
  await loadPaperCatalog(undefined,undefined,fetcher);
  assert.deepEqual(seen,['https://api.example.org/research/papers?bibliography=1&initiator=1']);
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=old;}
});

test('author lists preserve source order and missing metadata remains missing across older services',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 try{
  const q=fixture();q.papers[0].authors=['Van Jacobson','Michael J. Karels'];assert.deepEqual(validatePaperCatalog(q).papers[0].authors,q.papers[0].authors);
  const response={version:'research-paper-catalog-v1',access:'public-read-only',id,title:'Congestion Avoidance and Control',authors:q.papers[0].authors};
  const result=await loadPaperMetadata(id,undefined,async url=>{assert.equal(url,`https://api.example.org/research/papers/${id}/title?bibliography=1`);return Response.json(response);});assert.deepEqual(result.authors,q.papers[0].authors);
  await assert.rejects(()=>loadPaperMetadata(id,undefined,async()=>Response.json({...response,id:'another-paper'})),/invalid or incomplete/);
  delete response.authors;assert.equal((await loadPaperMetadata(id,undefined,async()=>Response.json(response))).authors,null);
  for(const authors of [[],['private@example.org'],['line\nbreak'],['x'.repeat(201)],['Valid Name',null]]){q.papers[0].authors=authors;assert.throws(()=>validatePaperCatalog(q),/invalid or incomplete/);}
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=old;}
});

test('initiator attribution accepts only a display name and keeps legacy or absent names unknown',()=>{
 const q=fixture();q.papers[0].initiated_by='Zoë O’Brien';assert.equal(validatePaperCatalog(q).papers[0].initiated_by,'Zoë O’Brien');
 q.papers[0].initiated_by=null;assert.equal(validatePaperCatalog(q).papers[0].initiated_by,null);
 delete q.papers[0].initiated_by;assert.equal(validatePaperCatalog(q).papers[0].initiated_by,undefined);
 for(const name of ['', 'name@example.org', {name:'Person',id:'private'},'line\nbreak','x'.repeat(202)]){q.papers[0].initiated_by=name;assert.throws(()=>validatePaperCatalog(q),/invalid or incomplete/);}
});
test('invalid page and paper identities and aborted requests do not initiate reads',async()=>{
 const fetcher=()=>assert.fail('No request expected');
 await assert.rejects(()=>loadPaperCatalog('bad,cursor',undefined,fetcher),/invalid/);
 await assert.rejects(()=>loadPaperMetadata('bad-id',undefined,fetcher),/invalid/);
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 try{const c=new AbortController();c.abort(new Error('Cancelled'));await assert.rejects(()=>loadPaperCatalog(undefined,c.signal,fetcher),/Cancelled/);}finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=old;}
});
test('personal catalogue uses verified authentication and never accepts public metadata as proof of ownership',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 try{
  globalThis.catalogAuthCalls=[];
  const q={...fixture(),access:'owner-read-only'};
  const result=await loadMyPaperCatalog(id,undefined,undefined,async(url,options)=>{
   assert.equal(url,'https://api.example.org/research/papers?bibliography=1&initiator=1&mine=1');assert.equal(options.headers.Authorization,'Bearer synthetic-test-token');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');return Response.json(q);
  });
  assert.equal(result.access,'owner-read-only');assert.deepEqual(globalThis.catalogAuthCalls,[{message:'Sign in to view your assessments.',userId:id}]);
  await assert.rejects(()=>loadMyPaperCatalog(id,undefined,undefined,async()=>Response.json(fixture())),/invalid or incomplete/);
  assert.throws(()=>validatePaperCatalog(q),/invalid or incomplete/);
  const calls=globalThis.catalogAuthCalls.length;
  await assert.rejects(()=>loadMyPaperCatalog(id,'bad,cursor'),/invalid/);
  await assert.rejects(()=>loadMyPaperCatalog('invalid'),/invalid/);
  const c=new AbortController();c.abort(new Error('Cancelled'));await assert.rejects(()=>loadMyPaperCatalog(id,undefined,c.signal),/Cancelled/);
  assert.equal(globalThis.catalogAuthCalls.length,calls);
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=old;}
});
test('legacy personal list verifies ownership and paginates beyond public pages containing other users papers',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 try{
  const papers=Array.from({length:126},(_,i)=>({...fixture().papers[0],id:`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,created_at:new Date(Date.UTC(2026,10,1)-i*1000).toISOString()}));
  const mine=papers.filter((_,i)=>i>=20&&i%3===2),owned=new Set(mine.map(p=>p.id)),seenRequests=[];
  const encode=paper=>Buffer.from(JSON.stringify({created_at:paper.created_at,id:paper.id})).toString('base64url');
  const fetcher=async(url,options)=>{
   const u=new URL(url);seenRequests.push(u.pathname+u.search);assert.equal(options.credentials,'omit');
   if(u.pathname.endsWith('/studies')){
    assert.equal(u.search,'?mine=1&status=1');assert.equal(options.headers.Authorization,'Bearer synthetic-test-token');
    return Response.json({access:'owner-drafts',studies:[...mine.map(p=>({id:p.id,study_kind:'paper'})),{id,study_kind:'idea'}]});
   }
   assert.equal(options.headers.Authorization,u.searchParams.get('mine')==='1'?'Bearer synthetic-test-token':undefined);
   const before=u.searchParams.get('before'),boundary=before?JSON.parse(Buffer.from(before,'base64url').toString()):null;
   const remaining=boundary?papers.filter(p=>p.created_at<boundary.created_at):papers;
   const selected=remaining.slice(0,10);
   return Response.json({...fixture(),papers:selected,coverage:{papers:selected.length},next_cursor:remaining.length>10?encode(selected.at(-1)):null});
  };
  let before,seen=[];
  do{
   const page=await loadMyPaperCatalog(id,before,undefined,fetcher);assert.equal(page.access,'owner-read-only');
   assert.ok(page.papers.every(p=>owned.has(p.id)));assert.equal(page.coverage.papers,page.papers.length);
   seen.push(...page.papers.map(p=>p.id));before=page.next_cursor??undefined;
  }while(before);
  assert.deepEqual(seen,mine.map(p=>p.id));assert.equal(new Set(seen).size,seen.length);assert.ok(seenRequests.length>12);
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=old;}
});
test('legacy owner responses cannot substitute public membership partial lists duplicate IDs or invalid identities',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 try{
  for(const invalid of [{access:'published',studies:[{id}]},{access:'owner-drafts',has_more:true,studies:[{id}]},{access:'owner-drafts',studies:[{id},{id}]},{access:'owner-drafts',studies:[{id:'invalid'}]},{access:'owner-drafts',studies:Array(101).fill({id})}]){
   await assert.rejects(()=>loadMyPaperCatalog(id,undefined,undefined,async url=>Response.json(url.includes('/studies?')?invalid:fixture())),/invalid or incomplete/);
  }
  await assert.rejects(()=>loadMyPaperCatalog(id,undefined,undefined,async url=>url.includes('/studies?')?new Response('{}',{status:401}):Response.json(fixture())),/HTTP 401/);
  let calls=0;
  const empty=await loadMyPaperCatalog(id,undefined,undefined,async url=>{calls++;return Response.json(url.includes('/studies?')?{access:'owner-drafts',studies:[]}:fixture());});
  assert.deepEqual(empty.papers,[]);assert.equal(empty.next_cursor,null);assert.equal(calls,2);
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=old;}
});
test('legacy pagination and cancellation failures never return a partial personal page',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 try{
  const page={...fixture(),papers:Array.from({length:10},(_,i)=>({...fixture().papers[0],id:`30000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`})),coverage:{papers:10},next_cursor:'next-page'};
  await assert.rejects(()=>loadMyPaperCatalog(id,undefined,undefined,async url=>Response.json(url.includes('/studies?')?{access:'owner-drafts',studies:[{id}]}:page)),/invalid or incomplete/);
  const controller=new AbortController();let calls=0;
  await assert.rejects(()=>loadMyPaperCatalog(id,undefined,controller.signal,async url=>{
   calls++;if(url.includes('/studies?')){controller.abort(new Error('Account changed'));return Response.json({access:'owner-drafts',studies:[{id}]});}return Response.json(page);
  }),/Account changed/);assert.equal(calls,2);
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=old;}
});
test('transport and oversized responses are errors rather than empty successful lists',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 try{
  await assert.rejects(()=>loadPaperCatalog(undefined,undefined,async()=>new Response('{}',{status:503})),/counts are unknown/);
  await assert.rejects(()=>loadPaperCatalog(undefined,undefined,async()=>new Response('x'.repeat(200001))),/byte budget/);
  await assert.rejects(()=>loadPaperCatalog(undefined,undefined,async()=>new Response('<html>Error</html>')),/unreadable/);
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=old;}
});
test('a separate catalogue origin leaves the general research API configuration alone',async()=>{
 const oldCatalog=process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL,oldResearch=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;
 process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL='http://127.0.0.1:4101';process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://cloud.example.org';
 try{
  await loadPaperCatalog(undefined,undefined,async(url,options)=>{assert.equal(new URL(url).origin,'http://127.0.0.1:4101');assert.equal(options.headers.Authorization,undefined);return Response.json(fixture());});
  assert.equal(process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL,'https://cloud.example.org');
 }finally{
  if(oldCatalog===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL=oldCatalog;
  if(oldResearch===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=oldResearch;
 }
});
test('individual assessment reads validate metadata identity preparation status and public projection',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 const detail={version:'research-paper-detail-v1',access:'public-read-only',paper:fixture().papers[0],preparation_status:'ready'};
 try{
  const result=await loadPaperDetail(id,undefined,async(url,options)=>{assert.equal(url,'https://api.example.org/research/papers/'+id);assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);return Response.json(detail);});
  assert.equal(result.preparation_status,'ready');
  for(const value of [{...detail,access:'owner-private'},{...detail,preparation_status:'invented'}, {...detail,paper:{...detail.paper,id:'other'}},{...detail,paper:{...detail.paper,owner_id:'private'}}])await assert.rejects(()=>loadPaperDetail(id,undefined,async()=>Response.json(value)),/invalid or incomplete/);
  await assert.rejects(()=>loadPaperDetail('invalid',undefined,()=>assert.fail()),/invalid/);
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=old;}
});
