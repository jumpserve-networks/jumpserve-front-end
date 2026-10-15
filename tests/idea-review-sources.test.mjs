import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewSources} from '../lib/idea-review-sources.ts';

const packet={id:'packet',sha256:'a'.repeat(64),version:3,document:{question:'Exact owner question',protocol:{statistics:'Bootstrap 100 repeats as independent samples.'},metrics:0,hypothesis:null,conditions:''}};
const field=(path,value,state='recorded')=>({path,value,present:true,state,value_sha256:'b'.repeat(64)});
const run=fields=>({packet_id:'packet',provenance:{tool_events:[{name:'submit_idea_issues',executed:false,source_evidence:{version:'idea-review-sources-v2',packet_sha256:packet.sha256,fields}}]}});
test('statistics display is verified against the saved packet rather than model prose',()=>{
 const source=reviewSources(run([field('/protocol/statistics',packet.document.protocol.statistics)]),packet);
 assert.equal(source.fields[0].value,packet.document.protocol.statistics);assert.equal(source.version,3);
});
test('wrong source value, plan hash, field presence and duplicate references are rejected',()=>{
 for(const fields of [[field('/protocol/statistics','Statistics disclaims independence.')],[field('/missing','invented')],[field('/metrics',0),field('/metrics',0)]])assert.throws(()=>reviewSources(run(fields),packet));
 const altered=run([]);altered.provenance.tool_events[0].source_evidence.packet_sha256='c'.repeat(64);assert.throws(()=>reviewSources(altered,packet));
});
test('recorded zero, null, empty and genuinely missing fields remain distinct',()=>{
 const missing={path:'/inputs',present:false,state:'missing',value_sha256:null};
 const source=reviewSources(run([field('/metrics',0),field('/hypothesis',null,'null'),field('/conditions','','empty'),missing]),packet);
 assert.deepEqual(source.fields.map(row=>row.state),['recorded','null','empty','missing']);assert.equal(source.fields[0].value,0);assert.ok(!Object.hasOwn(source.fields[3],'value'));
 assert.throws(()=>reviewSources(run([field('/metrics',false)]),packet));
});
test('legacy review history remains readable without pretending source evidence was captured',()=>assert.equal(reviewSources({provenance:{}},packet),null));
