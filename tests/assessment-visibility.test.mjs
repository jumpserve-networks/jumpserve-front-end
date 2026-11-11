import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readWithAssessmentDeletion} from '../lib/assessment-visibility.ts';

test('only a definitive missing deletion column enables the pre-migration read',async()=>{
 const calls=[];
 const result=await readWithAssessmentDeletion(async filterDeleted=>{
  calls.push(filterDeleted);
  return filterDeleted?{data:null,error:{code:'42703',message:'column research_studies.deleted_at does not exist'}}:{data:{id:'original'},error:null};
 });
 assert.deepEqual(calls,[true,false]);assert.equal(result.data.id,'original');
});
test('deleted and missing assessments remain hidden after migration, with no unfiltered retry',async()=>{
 const calls=[];const result=await readWithAssessmentDeletion(async filterDeleted=>{calls.push(filterDeleted);return{data:null,error:null};});
 assert.deepEqual(calls,[true]);assert.equal(result.data,null);
});
test('cache, permission, network and unrelated column failures never bypass deletion',async()=>{
 for(const error of [{code:'PGRST204',message:'deleted_at is absent from the schema cache'},{code:'42501',message:'permission denied'},{code:'42703',message:'column original_id does not exist'},{code:'57014',message:'query cancelled'}]){
  const calls=[];const result=await readWithAssessmentDeletion(async filterDeleted=>{calls.push(filterDeleted);return{data:null,error};});
  assert.deepEqual(calls,[true]);assert.equal(result.error,error);
 }
 await assert.rejects(readWithAssessmentDeletion(async()=>{throw new Error('Network unavailable');}),/Network unavailable/);
});
test('a later migration restores deletion filtering without restarting the app',async()=>{
 let migrated=false;const calls=[];
 const read=async filterDeleted=>{calls.push(filterDeleted);return !migrated&&filterDeleted?{data:null,error:{code:'42703',message:'column active_study.deleted_at does not exist'}}:{data:migrated?null:{id:'original'},error:null};};
 assert.equal((await readWithAssessmentDeletion(read)).data.id,'original');migrated=true;
 assert.equal((await readWithAssessmentDeletion(read)).data,null);assert.deepEqual(calls,[true,false,true]);
});
