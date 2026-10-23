import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {paperUploadMetadata,prepareUploadedPaper,PAPER_UPLOAD_MAX_BYTES} from '../lib/research-paper-upload.ts';
const id='10000000-0000-4000-8000-000000000001';
const raw='%PDF-1.4\nExplicit software input, not an academic paper.\n%%EOF';
const file=()=>new File([raw],'previous-paper.pdf',{type:'application/pdf'});
const result={id,review_version:'research-paper-review-v1',status:'preparing'};
const capabilities={autonomy:{version:'research-autonomy-v3',enabled:true},paper_uploads:{version:'research-paper-upload-v2',maximum_bytes:PAPER_UPLOAD_MAX_BYTES,review_version:'research-paper-review-v1',confirmation_required:true}};
function service(mutateTicket=x=>x,finalize=async()=>result){const calls=[];return {calls,request:async(path,options)=>{calls.push({path,options});if(path==='/capabilities')return capabilities;const body=JSON.parse(options.body);if(body.action==='prepare')return finalize();return mutateTicket({version:'research-paper-upload-v2',id,status:'pending',bucket:'research-paper-uploads',path:id+'/'+body.sha256,token:'explicit-test-upload-permission',sha256:body.sha256,byte_count:body.byte_count,maximum_bytes:PAPER_UPLOAD_MAX_BYTES});}};}
test('PDF identity uses exact original bytes and the filename without requiring a title or URL',async()=>{
 const metadata=await paperUploadMetadata(file());assert.equal(metadata.sha256,createHash('sha256').update(raw).digest('hex'));assert.equal(metadata.byte_count,Buffer.byteLength(raw));assert.equal(metadata.filename,'previous-paper.pdf');
 const s=service();let transferred;const value=await prepareUploadedPaper(s.request,id,file(),async(ticket,original)=>{transferred={ticket,original};});assert.equal(value.id,id);assert.equal(transferred.original.name,'previous-paper.pdf');
 const reservation=JSON.parse(s.calls[1].options.body);assert.equal(reservation.request_id,id);assert.equal(reservation.paper_url,undefined);assert.equal(reservation.title,undefined);assert.equal(reservation.domain,undefined);assert.equal(reservation.scope,undefined);assert.deepEqual(JSON.parse(s.calls[2].options.body),{action:'prepare',request_id:id});
});
test('empty, oversized, path-bearing and non-PDF inputs are rejected before network admission',async()=>{
 for(const invalid of [new File([],'empty.pdf'),new File(['not a PDF'],'fake.pdf'),new File([raw],'paper.txt'),new File([raw],'folder/paper.pdf'),new File([new Uint8Array(PAPER_UPLOAD_MAX_BYTES+1)],'large.pdf')]){
  let calls=0;await assert.rejects(()=>prepareUploadedPaper(async()=>{calls++;},id,invalid,async()=>{}),/PDF/);assert.equal(calls,0);
 }
});
test('an old service cannot silently accept an upload as a URL study',async()=>{
 let uploads=0;await assert.rejects(()=>prepareUploadedPaper(async()=>({autonomy:{version:'research-autonomy-v2'}}),id,file(),async()=>{uploads++;}),/PDF review update/);assert.equal(uploads,0);
});
test('upload permissions cannot redirect bytes to another study, hash or bucket',async()=>{
 for(const mutation of [t=>({...t,path:'another-study/'+t.sha256}),t=>({...t,bucket:'public-results'}),t=>({...t,sha256:'a'.repeat(64)}),t=>({...t,id:'another-id'}),t=>({...t,maximum_bytes:20000000})]){
  const s=service(mutation);let uploads=0;await assert.rejects(()=>prepareUploadedPaper(s.request,id,file(),async()=>{uploads++;}),/identity|permission/);assert.equal(uploads,0);assert.equal(s.calls.length,2);
 }
});
test('a lost upload response is reconciled by server hash verification with the same ID',async()=>{
 const s=service();assert.equal((await prepareUploadedPaper(s.request,id,file(),async()=>{throw new Error('Lost response');})).id,id);assert.equal(s.calls.filter(c=>c.options&&JSON.parse(c.options.body).action==='prepare').length,1);
});
test('a confirmed prior start does not upload again or create a second assessment',async()=>{
 const s=service(()=>({version:'research-paper-upload-v2',id,status:'started',result}));let uploads=0;assert.equal((await prepareUploadedPaper(s.request,id,file(),async()=>{uploads++;})).id,id);assert.equal(uploads,0);assert.equal(s.calls.length,2);
});
test('unconfirmed verification retains a useful retry error and does not automatically resubmit',async()=>{
 const s=service(x=>x,async()=>{throw new Error('Original bytes missing');});await assert.rejects(()=>prepareUploadedPaper(s.request,id,file(),async()=>{throw new Error('Transport failed');}),/same file and request.*Original bytes missing/);assert.equal(s.calls.length,3);
});

test('old service is rejected before reserving a PDF and an automatic start is not accepted',async()=>{
 let calls=0;
 await assert.rejects(()=>prepareUploadedPaper(async()=>{calls++;return {...capabilities,autonomy:{version:'research-autonomy-v2',enabled:true}};},id,file(),async()=>{}),/No paper was uploaded/);assert.equal(calls,1);
 const s=service(x=>x,async()=>({...result,review_version:'old-automatic-start'}));
 await assert.rejects(()=>prepareUploadedPaper(s.request,id,file(),async()=>{}),/Retry with this original request ID/);
});
