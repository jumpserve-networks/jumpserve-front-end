import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import * as catalog from '../lib/research-paper-catalog.ts';
const DETAIL_POLL_MS = 10000;

globalThis.__detailReact = React; globalThis.__detailCatalog = catalog;
const boundary = name => `export function ${name}(props){globalThis.__detailCaptures.push({name:'${name}',props});return globalThis.__detailReact.createElement('section',{'data-boundary':'${name}'},props.error??'');}`;
const replacements = {
  'next/link': "export default function Link({prefetch,...props}){return globalThis.__detailReact.createElement('a',props);}",
  '@/app/components/user-preferences': "export function LocalDateTime({value}){return globalThis.__detailReact.createElement('time',{dateTime:value},value??'Not recorded');}",
  '@/lib/research-paper-catalog': "export const loadPaperDetail=(...args)=>globalThis.__detailRead(...args);export const paperWorkflowLabel=(...args)=>globalThis.__detailCatalog.paperWorkflowLabel(...args);export const validPaperAuthors=(...args)=>globalThis.__detailCatalog.validPaperAuthors(...args);export const loadPaperMetadata=(...args)=>globalThis.__detailCatalog.loadPaperMetadata(...args);",
  '@/lib/research-public-queue': "export const loadPublicStudyQueue=(...args)=>globalThis.__detailQueueRead(...args);",
  './shared-assessment-records': boundary('SharedAssessmentRecords'),
  './public-experiment-queue': boundary('PublicExperimentQueue'),
  './experiment-queue': boundary('AssessmentGapExperiments'),
};
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {AssessmentDetail} = await import('../app/components/research-workflow/assessment-detail.tsx'); hook.deregister();

const ID = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222', STAMP = '2026-11-07T00:00:00Z';
let detail, detailReader, detailCalls, queueCalls;
const captures = name => globalThis.__detailCaptures.filter(value => value.name === name);
const last = name => captures(name).at(-1)?.props;
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
beforeEach(() => {
  detail = {version: 'research-paper-detail-v1', access: 'public-read-only', paper: {id: ID, title: 'Retained paper title', authors: ['Jane Doe', 'María José'], initiated_by: 'Verified Owner', created_at: STAMP, workflow_status: 'running', published: false}, preparation_status: 'confirmed'};
  detailCalls = []; queueCalls = []; globalThis.__detailCaptures = [];
  detailReader = async () => detail;
  globalThis.__detailRead = (...args) => {detailCalls.push(args); return detailReader(...args);};
  globalThis.__detailQueueRead = (...args) => {queueCalls.push(args); throw new Error('Queue reads must not be mounted on the assessment page.');};
});
afterEach(cleanup);
const show = async (props = {}) => {let view; await act(async () => {view = render(React.createElement(AssessmentDetail, {assessmentId: ID, ...props}));}); return view;};
const click = async name => {await act(async () => {fireEvent.click(screen.getByRole('button', {name, exact: true}));});};
const advance = async (t, milliseconds = DETAIL_POLL_MS) => {await act(async () => {t.mock.timers.tick(milliseconds);});};

test('owner wizard remains visible when paper metadata is unavailable', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  detailReader = async () => {throw new Error('Synthetic metadata failure');};
  await show({children: React.createElement('section', {'aria-label':'Owner wizard'}, 'Initial Assessment')});
  assert.ok(screen.getByRole('region',{name:'Owner wizard'}));assert.ok(screen.getByText('Initial Assessment'));
  assert.equal(document.querySelectorAll('main').length,1);assert.equal(queueCalls.length,0);
});

test('paper metadata is public without publication badges or separate publication navigation', async t => {
  t.mock.timers.enable({apis:['setTimeout']});detail.paper.published=true;await show();
  assert.ok(screen.getByRole('heading',{name:'Retained paper title'}));assert.ok(screen.getByText('Jane Doe, María José'));
  assert.ok(screen.getByText('Initiated by: Verified Owner'));assert.equal(document.querySelector('time').getAttribute('datetime'),STAMP);
  assert.equal(screen.queryByText('Published assessment'),null);assert.equal(screen.queryByText('Not published'),null);
  assert.equal(screen.queryByRole('link',{name:'Back to assessments'}),null);
  assert.equal(screen.queryByRole('button',{name:'Read published assessment'}),null);
  assert.equal(detailCalls.length,1);await advance(t,DETAIL_POLL_MS-1);assert.equal(detailCalls.length,1);await advance(t,1);assert.equal(detailCalls.length,2);assert.equal(queueCalls.length,0);
});
test('embedded paper metadata retains its title and details without adding a second main',async()=>{
 await show({embedded:true});assert.equal(document.querySelector('main'),null);assert.ok(screen.getByTestId('assessment-paper-header'));assert.ok(screen.getByRole('heading',{name:'Retained paper title'}));assert.ok(screen.getByText('Initiated by: Verified Owner'));
});

test('assessment status, claim progress, record controls and experiment queue are absent', async t => {
  t.mock.timers.enable({apis:['setTimeout']});detail.preparation_status='ready';await show();
  for(const name of ['Assessment status','Claim progress','Experiment Queue','Experiment jobs'])assert.equal(screen.queryByRole('heading',{name,exact:true}),null);
  for(const name of ['View assessment records','Hide assessment records','Show more claims'])assert.equal(screen.queryByRole('button',{name}),null);
  assert.equal(document.querySelector('[data-assessment-stage]'),null);
  assert.equal(captures('SharedAssessmentRecords').length,0);assert.equal(captures('PublicExperimentQueue').length,0);assert.equal(queueCalls.length,0);
});

test('missing bibliography and historical workflow state do not invent paper details', async t => {
  t.mock.timers.enable({apis:['setTimeout']});detail.paper.authors=null;detail.paper.initiated_by=null;detail.paper.workflow_status=null;await show();
  assert.ok(screen.getByText('Authors unavailable'));assert.ok(screen.getByText('Initiated by: Name unavailable'));assert.equal(screen.queryByText('Not published'),null);
  assert.equal(document.querySelectorAll('[data-slot="badge"]').length,0);assert.equal(screen.queryByRole('button',{name:'Read published assessment'}),null);
});

test('pending metadata keeps loading explicit and unmount cancels its read and polling', async t => {
  t.mock.timers.enable({apis:['setTimeout']});const pending=deferred();detailReader=()=>pending.promise;
  const view=await show();assert.ok(screen.getByRole('heading',{name:'Loading assessment…'}));assert.ok(screen.getByText('Loading assessment information…'));
  await act(async()=>{pending.resolve(detail);});assert.ok(screen.getByRole('heading',{name:'Retained paper title'}));
  view.unmount();assert.equal(detailCalls[0][1].aborted,true);const count=detailCalls.length;await advance(t,DETAIL_POLL_MS*3);assert.equal(detailCalls.length,count);
});

test('failed metadata refresh preserves prior details with a stale warning and a retry', async t => {
  t.mock.timers.enable({apis:['setTimeout']});await show();detailReader=async()=>{throw new Error('Synthetic catalog interruption');};await advance(t);
  assert.ok(screen.getByRole('heading',{name:'Retained paper title'}));assert.match(screen.getByRole('alert').textContent,/Previously retrieved details may be stale/);
  const signal=detailCalls.at(-1)[1];detailReader=async()=>detail;await click('Retry details');assert.equal(signal.aborted,true);assert.equal(screen.queryByRole('alert'),null);assert.equal(queueCalls.length,0);
});

test('failed or missing metadata never invents a title or an empty successful response', async t => {
  t.mock.timers.enable({apis:['setTimeout']});detailReader=async()=>{throw 'Unstructured catalog failure';};await show();
  assert.ok(screen.getByRole('heading',{name:'Paper title unavailable'}));assert.match(screen.getByRole('alert').textContent,/Assessment details are unavailable/);
  cleanup();detailReader=async()=>({...detail,paper:{...detail.paper,title:null}});await show();assert.ok(screen.getByRole('heading',{name:'Paper title unavailable'}));
});

test('late metadata from an abandoned identity cannot overwrite the new assessment or its follow-up', async t => {
  t.mock.timers.enable({apis:['setTimeout']});const old=deferred();
  detailReader=id=>id===ID?old.promise:Promise.resolve({...detail,paper:{...detail.paper,id:OTHER,title:'Current assessment'}});
  const view=await show();const signal=detailCalls[0][1];
  await act(async()=>{view.rerender(React.createElement(AssessmentDetail,{assessmentId:OTHER,gapId:ID,launchId:OTHER}));});
  assert.equal(signal.aborted,true);assert.ok(screen.getByRole('heading',{name:'Current assessment'}));assert.deepEqual(last('AssessmentGapExperiments'),{studyId:OTHER,gapId:ID,launchId:OTHER});
  await act(async()=>{old.resolve(detail);});assert.ok(screen.getByRole('heading',{name:'Current assessment'}));assert.equal(queueCalls.length,0);
});

test('late failures after unmount create no stale alert or new poll', async t => {
  t.mock.timers.enable({apis:['setTimeout']});const pending=deferred();detailReader=()=>pending.promise;
  const view=await show();view.unmount();await act(async()=>{pending.reject(new Error('Abandoned metadata error'));});
  await advance(t,DETAIL_POLL_MS*3);assert.equal(detailCalls.length,1);assert.equal(screen.queryByRole('alert'),null);assert.equal(queueCalls.length,0);
});
