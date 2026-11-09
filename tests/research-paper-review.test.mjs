import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){return next(['./research-paper-upload','./research-autonomy'].includes(specifier)?new URL('../lib/'+specifier.slice(2)+'.ts',import.meta.url).href:specifier,context);}});
const {validatePaperReview,reviewRoles,selectedReviewIds,parseReviewAuthors,PAPER_AUTHORS_VERSION}=await import('../lib/research-paper-review.ts');hook.deregister();
const id='10000000-0000-4000-8000-000000000001';
const base={version:'research-paper-review-v1',id,status:'ready',revision:4,title:'Paper',domain:'Networking',progress:'Extraction finished',reason:null,can_start:true,claims:[{id:'claim',description:'Recorded latency is 10 ms.',claim_type:'numerical',location:'PDF page 1',source_id:'source'}],coverage:{},confirmation:null,limits:{max_spend_cents:10000,committed_cents:500,deadline_at:'2026-11-01T00:00:00Z'}};
test('ready review and missing metadata retain exact claim units and missing values',()=>{const value={...base,title:null,domain:null};assert.equal(validatePaperReview(value,id),value);assert.equal(value.title,null);assert.equal(value.claims[0].description,'Recorded latency is 10 ms.');});
test('cross-paper identity, old versions, duplicate claims and false authorization fail closed',()=>{
 for(const patch of [{id:'other'},{version:'old'},{revision:0},{claims:[...base.claims,...base.claims]},{status:'preparing'},{limits:{...base.limits,max_spend_cents:9999}},{progress:{injected:'text'}}])assert.throws(()=>validatePaperReview({...base,...patch},id),/could not be verified/);
});
test('review preserves explicit unlimited funding and rejects missing limits and bounded overruns',()=>{
 const value={...base,limits:{...base.limits,max_spend_cents:null,committed_cents:150000}};
 assert.equal(validatePaperReview(value,id).limits.committed_cents,150000);
 for(const cap of [undefined,0,100000])assert.throws(()=>validatePaperReview({...value,limits:{...value.limits,max_spend_cents:cap}},id));
});
test('versioned category limits retain historical commitments after an owner lowers the current cap',()=>{
 const policy={version:'autonomy-category-budgets-v1',category:'research_assessment',revision:2,max_spend_cents:0,max_model_calls:0};
 const value={...base,limits:{...base.limits,budget_policy:policy,max_spend_cents:0,committed_cents:500}};
 assert.equal(validatePaperReview(value,id).limits.committed_cents,500);
 assert.throws(()=>validatePaperReview({...value,limits:{...value.limits,budget_policy:{...policy,revision:0}}},id),/could not be verified/);
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
test('author edits preserve order, Unicode and commas and support an unknown byline',()=>{
 assert.deepEqual(parseReviewAuthors('  Doe, Jane\r\nMaría José de la Cruz\n\nAnne O’Connor  '),['Doe, Jane','María José de la Cruz','Anne O’Connor']);
 assert.deepEqual(parseReviewAuthors(' \n\n'),[]);
 for(const text of ['a'.repeat(201),Array(101).fill('Author').join('\n'),'mail@example.org','https://example.org','Name\u0000'])assert.throws(()=>parseReviewAuthors(text));
});
test('review author fields remain compatible with older responses and reject malformed lists',()=>{
 assert.equal(validatePaperReview(base,id),base);
 assert.deepEqual(validatePaperReview({...base,authors_version:PAPER_AUTHORS_VERSION,authors:['Doe, Jane']},id).authors,['Doe, Jane']);
 assert.equal(validatePaperReview({...base,authors_version:PAPER_AUTHORS_VERSION,authors:null},id).authors,null);
 for(const change of [{authors_version:'unknown',authors:[]},{authors_version:PAPER_AUTHORS_VERSION},{authors:'Author'},{authors:['']},{authors:['a'.repeat(201)]}])assert.throws(()=>validatePaperReview({...base,...change},id));
});
