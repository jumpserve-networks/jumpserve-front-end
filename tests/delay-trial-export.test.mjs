import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
globalThis.__trialReact=React;
const replacements={
 'next/link':"export default function Link(props){return globalThis.__trialReact.createElement('a',props);}",
 'next/navigation':"export function notFound(){throw Object.assign(new Error('Synthetic not found'),{code:'NEXT_NOT_FOUND'});}",
 '@/app/components/user-preferences':"export const LocalDateTime=({value,fallback})=>globalThis.__trialReact.createElement('time',{},value??fallback);",
 '@/lib/delay-study-server':'export const getStudyTrial=async()=>globalThis.__trialData;export const getStudyData=async()=>globalThis.__trialStudy;export const getStudyClaims=async()=>[{claim_id:"original-claim"}];export const getStudyPapers=async()=>[{reference_number:0}];',
};
const hook=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {default:TrialPage}=await import('../app/(modules)/propagation-delay-study/test-results/[trialId]/page.tsx');const {GET:trialExport}=await import('../app/(modules)/propagation-delay-study/test-results/[trialId]/data/route.ts');const {GET:studyExport}=await import('../app/(modules)/propagation-delay-study/data/route.ts');hook.deregister();
const props={params:Promise.resolve({trialId:'original-trial'})};
beforeEach(()=>{globalThis.__trialData={trial:{id:'original-trial',status:'failed',replicate:0,start_order:[1,2],started_at:null,finished_at:null,attempt_id:'original-worker',error:'Original trial failure',validation_errors:['Original calibration failure'],kernel_release:null,runner_sha256:null},configuration:{family:'homogeneous_bbr',treatment:'baseline',capacity_mbps:100,queue_packets:1000,duration_seconds:60,warmup_seconds:10},paired:{id:'paired-original',status:'completed'},flows:[{flow_index:1,cca:'bbr',configured_base_rtt_ms:0,natural_min_rtt_ms:null,added_ack_delay_ms:0,effective_min_rtt_ms:0,goodput_mbps:0,measured_seconds:0,retransmits:null}],samples:[]};globalThis.__trialStudy={campaign:{status:'incomplete'},configurations:[],trials:[]};});
test('trial page keeps failed validations recorded missing values paired identity and zero measurements',async()=>{
 const document=new JSDOM(renderToStaticMarkup(await TrialPage(props))).window.document;assert.match(document.body.textContent,/Original trial failure/);assert.match(document.body.textContent,/Original calibration failure/);assert.match(document.body.textContent,/0.00 Mbps/);assert.equal(document.querySelector('a[href$="paired-original"]').getAttribute('href'),'/propagation-delay-study/test-results/paired-original');assert.match(document.body.textContent,/not recorded/);
 globalThis.__trialData.flows=[];globalThis.__trialData.paired=null;globalThis.__trialData.trial.error=null;globalThis.__trialData.trial.validation_errors=[];const empty=new JSDOM(renderToStaticMarkup(await TrialPage(props))).window.document;assert.match(empty.body.textContent,/No flow measurements recorded/);assert.equal(empty.querySelector('a[href$="paired-original"]'),null);globalThis.__trialData=null;await assert.rejects(TrialPage(props),{code:'NEXT_NOT_FOUND'});
});
test('trial and campaign JSON exports retain exact evidence schema units no-store headers and missing-record status',async()=>{
 let response=await trialExport(new Request('https://example.test'),props);const original=await response.json();assert.deepEqual(original.flows,globalThis.__trialData.flows);assert.equal(original.schema_version,1);assert.equal(original.units.payload,'bytes');assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-disposition'),/original-trial/);
 response=await studyExport();const study=await response.json();assert.equal(study.units.sensitivity,'log2(max mean goodput / min mean goodput)');assert.deepEqual(study.claims,[{claim_id:'original-claim'}]);assert.deepEqual(study.literature,[{reference_number:0}]);globalThis.__trialData=null;globalThis.__trialStudy=null;assert.equal((await trialExport(new Request('https://example.test'),props)).status,404);assert.equal((await studyExport()).status,404);
});
