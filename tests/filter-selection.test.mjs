import assert from 'node:assert/strict';
import test from 'node:test';
import {updateFilterSelection} from '../lib/filter-selection.ts';

test('repeated checkbox notifications remain unique and retain the original selection order',()=>{
 for(const [original,value] of [[['bbr','cubic'],'reno'],[[0,10],20]]){
  const before=[...original];const next=updateFilterSelection(original,value,true);
  assert.deepEqual(next,[...before,value]);assert.deepEqual(original,before);
  assert.equal(updateFilterSelection(next,value,true),next);
  assert.deepEqual(updateFilterSelection(next,value,false),before);
  assert.deepEqual(updateFilterSelection(original,value,false),before);
 }
});
