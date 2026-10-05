import test from 'node:test';
import assert from 'node:assert/strict';
import {numberLabel,rangeLabel,normalizeReliable} from '../lib/reliable-study.ts';
test('scientific display distinguishes missing, invalid, small recorded values and zero',()=>{
 assert.equal(numberLabel(null),'missing');assert.equal(numberLabel(NaN),'invalid');assert.equal(numberLabel(0),'0');assert.notEqual(numberLabel(0.00001),'0');assert.equal(rangeLabel(),'missing');
});
test('Postgres numeric conversion rejects malformed values and preserves missing values',()=>{
 assert.deepEqual(normalizeReliable({median:'0',min:null,max:'1.5'}),{median:0,min:null,max:1.5});assert.throws(()=>normalizeReliable({median:'n/a'}));assert.throws(()=>normalizeReliable({value:''}));
});
