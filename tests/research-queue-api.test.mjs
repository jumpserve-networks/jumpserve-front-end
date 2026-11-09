import assert from 'node:assert/strict';
import test from 'node:test';
import {requireGapQueueApi,GAP_BACKEND_REQUIRED} from '../lib/research-queue-api.ts';

test('unsupported gap launches stop at the capability read before any write', async () => {
  for (const capabilities of [{},{preparation:{gap_queue_version:'older'}}]) {
    const calls=[];
    await assert.rejects(requireGapQueueApi(async (path,options)=>{calls.push({path,options});return capabilities;}),new RegExp(GAP_BACKEND_REQUIRED));
    assert.deepEqual(calls.map(call=>call.path),['/capabilities']);
    assert.equal(calls[0].options.method,undefined);
  }
});
test('released gap capability passes its original cancellation signal', async () => {
  const controller=new AbortController();
  await requireGapQueueApi(async (path,options)=>{
    assert.equal(path,'/capabilities');assert.equal(options.signal,controller.signal);
    return {preparation:{gap_queue_version:'research-gap-queue-v1'}};
  },controller.signal);
});
