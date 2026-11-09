import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){if(specifier==='next/server')return next('next/server.js',context);if(specifier==='@/lib/emulated-runs-data')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export const fetchParentRunsForIndexPage=(...args)=>globalThis.__parentApiRead(...args);')};return next(specifier,context);}});
const {GET}=await import('../app/(modules)/congestion-control-emulated/api/parent-runs/route.ts');hook.deregister();
let calls,reader;
beforeEach(()=>{calls=[];reader=async()=>({runs:[],total:0});globalThis.__parentApiRead=(...args)=>{calls.push(args);return reader(...args);};});
const request=query=>new Request('https://example.test/congestion-control-emulated/api/parent-runs'+(query?'?'+query:''));
test('parent-run API defaults to a bounded public page without inventing filters',async()=>{
 const response=await GET(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),{runs:[],total:0});
 assert.deepEqual(calls[0][0],{page:1,pageSize:30,filters:{runSearchQuery:undefined,clientCounts:[],ccaLabels:[],ccaByClientNumber:{1:[],2:[]},addedDelaysMs:[],clientStartDelaysMs:[],clientFileSizesMegabytes:[],bottleneckRatesMegabit:[],queueBufferSizesKilobyte:[]}});
});
test('parent-run API bounds pagination and keeps repeated numeric and CCA filters in their own fields',async()=>{
 await GET(request('page=0&pageSize=500&search=original&clientCount=2&clientCount=NaN&cca=%20cubic%20&cca=%20&ccaClient1=bbr&ccaClient2=reno&addedDelayMs=0&clientStartDelayMs=5&clientFileSizeMb=50&bottleneckRateMbit=10&queueBufferKbyte=0'));
 assert.deepEqual(calls[0][0],{page:1,pageSize:30,filters:{runSearchQuery:'original',clientCounts:[2],ccaLabels:['cubic'],ccaByClientNumber:{1:['bbr'],2:['reno']},addedDelaysMs:[0],clientStartDelaysMs:[5],clientFileSizesMegabytes:[50],bottleneckRatesMegabit:[10],queueBufferSizesKilobyte:[0]}});
 for(const [query,page,pageSize] of [['page=-1&pageSize=-1',1,30],['page=invalid&pageSize=invalid',1,30],['page=2&pageSize=0',2,1]]){await GET(request(query));assert.equal(calls.at(-1)[0].page,page);assert.equal(calls.at(-1)[0].pageSize,pageSize);}
});
test('parent-run failures retain safe error messages and unstructured failures use a fixed fallback',async()=>{
 for(const [failure,message] of [[new Error('Recorded database read unavailable'),'Recorded database read unavailable'],[null,'Failed to load parent runs.']]){reader=async()=>{throw failure;};const response=await GET(request());assert.equal(response.status,500);assert.deepEqual(await response.json(),{error:message});}
});
