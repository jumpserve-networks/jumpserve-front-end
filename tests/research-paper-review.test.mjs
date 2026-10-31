import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){return next(['./research-paper-upload','./research-autonomy'].includes(specifier)?new URL('../lib/'+specifier.slice(2)+'.ts',import.meta.url).href:specifier,context);}});
const {validatePaperReview,paperReviewBudgetTerms,reviewRoles,selectedReviewIds}=await import('../lib/research-paper-review.ts');hook.deregister();
const id='10000000-0000-4000-8000-000000000001';
const base={version:'research-paper-review-v1',id,status:'ready',revision:4,title:'Paper',domain:'Networking',progress:'Extraction finished',reason:null,can_start:true,claims:[{id:'claim',description:'Recorded latency is 10 ms.',claim_type:'numerical',location:'PDF page 1',source_id:'source'}],coverage:{},confirmation:null,limits:{max_spend_cents:10000,committed_cents:500,deadline_at:'2026-11-01T00:00:00Z'}};
test('confirmation terms use the recorded funding limit and shared deadline',()=>{
 assert.match(paperReviewBudgetTerms({...base.limits,max_spend_cents:null}),/No aggregate spending cap/);
 assert.match(paperReviewBudgetTerms(base.limits),/\$100\.00 aggregate spending cap/);
 assert.match(paperReviewBudgetTerms({...base.limits,max_spend_cents:100000}),/\$1,000\.00/);
 assert.match(paperReviewBudgetTerms(base.limits),/recorded deadline/);
});
test('ready review and missing metadata retain exact claim units and missing values',()=>{const value={...base,title:null,domain:null};assert.equal(validatePaperReview(value,id),value);assert.equal(value.title,null);assert.equal(value.claims[0].description,'Recorded latency is 10 ms.');});
test('cross-paper identity, old versions, duplicate claims and false authorization fail closed',()=>{
 for(const patch of [{id:'other'},{version:'old'},{revision:0},{claims:[...base.claims,...base.claims]},{status:'preparing'},{limits:{...base.limits,max_spend_cents:9999}},{progress:{injected:'text'}}])assert.throws(()=>validatePaperReview({...base,...patch},id),/could not be verified/);
});
test('review preserves explicit unlimited funding and rejects missing limits and bounded overruns',()=>{
 const value={...base,limits:{...base.limits,max_spend_cents:null,committed_cents:150000}};
 assert.equal(validatePaperReview(value,id).limits.committed_cents,150000);
 for(const cap of [undefined,0,100000])assert.throws(()=>validatePaperReview({...value,limits:{...value.limits,max_spend_cents:cap}},id));
});
test('confirmed reviews require retained selection and complete confirmation fields',()=>{assert.throws(()=>validatePaperReview({...base,status:'confirmed',can_start:false},id),/could not be verified/);assert.throws(()=>validatePaperReview({...base,status:'confirmed',can_start:false,confirmation:{title:'Paper',domain:'Networking',claim_ids:['foreign-claim']}},id),/could not be verified/);assert.equal(validatePaperReview({...base,status:'confirmed',can_start:false,confirmation:{title:'Paper',domain:'Networking',claim_ids:['claim']}},id).status,'confirmed');});

const organization={version:'paper-review-selection-v1',status:'ready',central_claims:[],testable_findings:[{claim_id:'claim',label:'Latency under fixed conditions'}],candidate_count:1,cursor:1};
test('source-linked review groups retain original statements and reject overlaps or false coverage',()=>{
 assert.equal(validatePaperReview({...base,organization},id).claims[0].description,'Recorded latency is 10 ms.');
 assert.deepEqual(reviewRoles({...base,organization}),{claim:'testable_findings'});
 for(const change of [{candidate_count:184},{cursor:0},{version:'unverified'},{central_claims:[{claim_id:'claim',label:'Duplicate'}]},{central_claims:[{claim_id:'foreign',label:'Foreign claim'}]}])assert.throws(()=>validatePaperReview({...base,organization:{...organization,...change}},id));
 const empty={...organization,central_claims:[],testable_findings:[]};assert.deepEqual(reviewRoles(validatePaperReview({...base,organization:empty},id)),{});
});
test('explicit grouped selection supports either group alone and rejects duplicate IDs',()=>{
 assert.deepEqual(selectedReviewIds({central_claims:['claim'],testable_findings:[]}),['claim']);
 assert.deepEqual(selectedReviewIds({central_claims:[],testable_findings:['claim']}),['claim']);
 assert.deepEqual(selectedReviewIds({central_claims:[],testable_findings:[]}),[]);
 assert.throws(()=>selectedReviewIds({central_claims:['claim'],testable_findings:['claim']}));
 assert.throws(()=>selectedReviewIds({central_claims:[],testable_findings:[],extra:[]}));
});
test('confirmed owner categories override suggestions without rewriting the original statement',()=>{
 const value={...base,organization,status:'confirmed',can_start:false,confirmation:{title:'Paper',domain:'Networking',claim_ids:['claim'],selection:{central_claims:['claim'],testable_findings:[]}}};
 assert.deepEqual(reviewRoles(validatePaperReview(value,id)),{claim:'central_claims'});
 assert.throws(()=>validatePaperReview({...value,confirmation:{...value.confirmation,selection:{central_claims:[],testable_findings:[]}}},id),/do not match/);
});
