import assert from 'node:assert/strict';
import test from 'node:test';
import { executableCandidate, preparedQueueRequests } from '../lib/network-execution.ts';
import { emptyIdea } from '../lib/research-ideas.ts';
const plan={...emptyIdea(),question:'Local software fixture question',hypothesis:'Explicit untested hypothesis',controls:'Matched fixture conditions',limitations:'Development only'};
const limits={wall_seconds:1800,max_instances:1,max_output_bytes:3000000,max_network_bytes:1000000};
const build=(prior=null)=>executableCandidate(plan,prior,'custom-package-v1','case-1',{fixture:true},2,limits,[{name:'response_headers_ms',units:'ms'}]);

test('executable candidates reject invalid replication and metric declarations before preparing any job',()=>{
 for(const replication of [0,33,1.5,NaN])assert.throws(()=>executableCandidate(plan,null,'custom-package-v1','case-1',{},replication,limits,[{name:'latency',units:'ms'}]),/1–32/);for(const metrics of [null,[],[null],[{name:0,units:'ms'}],[{name:' ',units:'ms'}],[{name:'latency',units:0}],[{name:'latency',units:' '}]])assert.throws(()=>executableCandidate(plan,null,'custom-package-v1','case-1',{},1,limits,metrics),/metric names/);
 const input=[{identity:'original',sha256:'a'.repeat(64)}];const result=build({input_versions:input,execution:{exclusive_resources:['machine:original']}});assert.equal(result.input_versions,input);assert.deepEqual(result.execution.exclusive_resources,['machine:original']);assert.deepEqual(build({execution:'unsupported legacy value'}).execution.exclusive_resources,[]);assert.deepEqual(build({execution:{}}).execution.exclusive_resources,[]);const empty=executableCandidate({...plan,controls:''},null,'custom-package-v1','original',{},1,limits,[{name:'latency',units:'ms'}]);assert.deepEqual(empty.controls,[]);
});
test('executable candidate preserves unknown methods rather than inventing a scientific protocol',()=>{
 const p=build();assert.equal(p.planned_units,2);assert.equal(p.execution.runner,'custom-package-v1');assert.equal(p.dates_or_epochs,'');assert.equal(p.sample_size_rationale,'');assert.equal(p.seeds.rationale,'');assert.equal(p.prior_exposure,'');assert.deepEqual(p.input_versions,[]);
});
test('execution compilation retains prior scientific decisions and stricter observation budgets',()=>{
 const p=build({dates_or_epochs:'Declared software epoch',statistics:'Whole-trial analysis',prior_exposure:'Known development exposure',resource_limits:{max_observations:12,max_input_bytes:12000}});
 assert.equal(p.statistics,'Whole-trial analysis');assert.equal(p.resource_limits.max_observations,12);assert.equal(p.resource_limits.max_input_bytes,12000);assert.equal(p.prior_exposure,'Known development exposure');
});
test('configuration identities and repetitions define invocation count, not packet count',()=>{
 const p=build({configurations:[{identity:'case-1',details:{epoch:'retained'}},{identity:'case-2',details:{test_config:{fixture:true}}}]});
 assert.equal(p.configurations.length,2);assert.equal(p.configurations[0].details.epoch,'retained');assert.equal(p.planned_units,4);
});
test('fanout preserves original job identities and supports legacy manual preparations',()=>{
 const a={request_id:'a',campaign_id:'campaign',execution_mode:'automatic'},b={...a,request_id:'b'};
 assert.deepEqual(preparedQueueRequests({queue_request:a,queue_requests:[a,b]}),[a,b]);assert.deepEqual(preparedQueueRequests({queue_request:a}),[a]);
 assert.throws(()=>preparedQueueRequests({queue_request:a,queue_requests:[a,a]}));assert.throws(()=>preparedQueueRequests({queue_request:a,queue_requests:[]}));
});
