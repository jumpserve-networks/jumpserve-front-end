import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){return next(specifier==='./research-paper-upload'?new URL('../lib/research-paper-upload.ts',import.meta.url).href:specifier,context);}});
const {validatePaperReview}=await import('../lib/research-paper-review.ts');hook.deregister();
const id='10000000-0000-4000-8000-000000000001';
const base={version:'research-paper-review-v1',id,status:'ready',revision:4,title:'Paper',domain:'Networking',progress:'Extraction finished',reason:null,can_start:true,claims:[{id:'claim',description:'Recorded latency is 10 ms.',claim_type:'numerical',location:'PDF page 1',source_id:'source'}],coverage:{},confirmation:null,limits:{max_spend_cents:10000,committed_cents:500,deadline_at:'2026-11-01T00:00:00Z'}};
test('ready review and missing metadata retain exact claim units and missing values',()=>{const value={...base,title:null,domain:null};assert.equal(validatePaperReview(value,id),value);assert.equal(value.title,null);assert.equal(value.claims[0].description,'Recorded latency is 10 ms.');});
test('cross-paper identity, old versions, duplicate claims and false authorization fail closed',()=>{
 for(const patch of [{id:'other'},{version:'old'},{revision:0},{claims:[...base.claims,...base.claims]},{status:'preparing'},{limits:{...base.limits,max_spend_cents:20000}},{progress:{injected:'text'}}])assert.throws(()=>validatePaperReview({...base,...patch},id),/could not be verified/);
});
test('confirmed reviews require retained selection and complete confirmation fields',()=>{assert.throws(()=>validatePaperReview({...base,status:'confirmed',can_start:false},id),/could not be verified/);assert.throws(()=>validatePaperReview({...base,status:'confirmed',can_start:false,confirmation:{title:'Paper',domain:'Networking',claim_ids:['foreign-claim']}},id),/could not be verified/);assert.equal(validatePaperReview({...base,status:'confirmed',can_start:false,confirmation:{title:'Paper',domain:'Networking',claim_ids:['claim']}},id).status,'confirmed');});
