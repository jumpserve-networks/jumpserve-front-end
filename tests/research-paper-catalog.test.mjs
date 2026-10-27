import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(s,c,next){return next(s.startsWith('@/lib/')?new URL('../lib/'+s.slice(6)+'.ts',import.meta.url).href:s,c);}});
const {validatePaperCatalog,loadPaperCatalog,loadPaperTitle,loadPaperMetadata,paperWorkflowLabel}=await import('../lib/research-paper-catalog.ts');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';
function fixture(){return {version:'research-paper-catalog-v1',access:'public-read-only',papers:[{id,title:null,created_at:'2026-10-22T00:00:00Z',workflow_status:'budget',published:false}],coverage:{papers:1},next_cursor:null};}
test('unpublished paper metadata and null titles remain distinct from published results',()=>{
 const q=validatePaperCatalog(fixture());assert.equal(q.papers[0].title,null);assert.equal(q.papers[0].published,false);
 assert.equal(paperWorkflowLabel('budget'),'Spending limit reached');assert.equal(paperWorkflowLabel('completed-with-blockers'),'Finished with gaps');assert.equal(paperWorkflowLabel(null),'Submitted');
});
test('private fields, duplicate identities, invalid states and incorrect coverage fail closed',()=>{
 for(const change of [q=>q.owner_id='private',q=>q.papers[0].paper_upload='private',q=>q.papers.push(q.papers[0]),q=>q.coverage.papers=0,q=>q.papers[0].workflow_status='reproduced',q=>q.next_cursor='abc',q=>q.papers[0].created_at='bad']){
  const q=fixture();change(q);assert.throws(()=>validatePaperCatalog(q),/invalid or incomplete/);
 }
});
test('public reads never send credentials and title responses must match the requested paper',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 try{
  const seen=[];const fetcher=async(url,options)=>{seen.push(url);assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,undefined);return new Response(JSON.stringify(url.includes('/title')?{version:'research-paper-catalog-v1',access:'public-read-only',id,title:'Actual Paper Title'}:fixture()));};
  await loadPaperCatalog(undefined,undefined,fetcher);assert.equal(await loadPaperTitle(id,undefined,fetcher),'Actual Paper Title');
  assert.deepEqual(seen,['https://api.example.org/research/papers?bibliography=1&initiator=1',`https://api.example.org/research/papers/${id}/title`]);
  await assert.rejects(()=>loadPaperTitle(id,undefined,async()=>new Response(JSON.stringify({version:'research-paper-catalog-v1',access:'public-read-only',id:'other',title:'Wrong Paper'}))),/invalid or incomplete/);
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
 await assert.rejects(()=>loadPaperTitle('bad-id',undefined,fetcher),/invalid/);
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 try{const c=new AbortController();c.abort(new Error('Cancelled'));await assert.rejects(()=>loadPaperCatalog(undefined,c.signal,fetcher),/Cancelled/);}finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=old;}
});
test('transport and oversized responses are errors rather than empty successful lists',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://api.example.org';
 try{
  await assert.rejects(()=>loadPaperCatalog(undefined,undefined,async()=>new Response('{}',{status:503})),/counts are unknown/);
  await assert.rejects(()=>loadPaperCatalog(undefined,undefined,async()=>new Response('x'.repeat(200001))),/byte budget/);
  await assert.rejects(()=>loadPaperCatalog(undefined,undefined,async()=>new Response('<html>Error</html>')),/unreadable/);
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=old;}
});
