import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

globalThis.__assessmentReact = React;
const listURL = new URL('../lib/research-assessment-list.ts', import.meta.url).href;
const sources = {
  'next/link': `export default function Link({href,scroll,prefetch,replace,...props}) {return globalThis.__assessmentReact.createElement('a',{...props,href});}`,
  'next/form': `export default function Form({action,...props}) {return globalThis.__assessmentReact.createElement('form',{...props,action});}`,
  '@/app/components/user-preferences': `export const useUserPreferences=()=>globalThis.__assessmentPreferences; export const LocalDateTime=({value})=>globalThis.__assessmentReact.createElement('time',{},value);`,
  '@/lib/research-assessment-list': `export {assessmentListPath} from ${JSON.stringify(listURL)};export const loadAssessmentList=(...args)=>globalThis.__assessmentLoad(...args);`,
};
const hook = registerHooks({resolve(specifier, context, next) {
  if (sources[specifier]) return {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(sources[specifier])};
  return next(specifier, context);
}});
const {Assessments} = await import('../app/components/research-workflow/assessments.tsx');
hook.deregister();
afterEach(() => {cleanup(); delete globalThis.__assessmentPreferences; delete globalThis.__assessmentLoad;});

const id = '91169871-14c2-4bde-a0a5-50bf78403d86';
const paper = change => ({id, title: 'Synthetic networking paper', authors: ['Fixture Author'], initiated_by: 'Fixture Initiator',
  created_at: '2026-11-01T00:00:00Z', workflow_status: 'running', published: false, ...change});
const catalog = (papers, next_cursor = null) => ({version: 'research-paper-catalog-v1', access: 'public-read-only', papers, coverage: {papers: papers.length}, next_cursor});
function show(props = {}, value = catalog([paper()])) {
  globalThis.__assessmentLoad ??= async () => value;
  return render(React.createElement(Assessments, props));
}

test('table is the default view and recorded title, initiator, stage and detail link appear', async () => {
  show();
  const table = await screen.findByRole('table');
  assert.match(table.textContent, /Fixture Initiator/);
  assert.match(table.textContent, /In progress/);
  assert.match(table.textContent, /Not published/);
  assert.equal(screen.getByRole('link', {name: 'Synthetic networking paper'}).getAttribute('href'), `/research-verification/assessment/${id}`);
  assert.equal(screen.getByRole('button', {name: 'Table'}).getAttribute('aria-current'), 'page');
  assert.equal(screen.getByRole('button', {name: 'All Assessments'}).getAttribute('aria-current'), 'page');
  assert.equal(screen.getByLabelText('Filter by name').getAttribute('type'), 'search');
});
test('the first catalogue page offers an older page without a redundant newest-page link',async()=>{
 show({},catalog([paper()],'next'));await screen.findByRole('link',{name:'Older assessments'});assert.equal(screen.queryByRole('link',{name:'Newest assessments'}),null);
});
test('missing catalogue bibliography remains loading until its own metadata arrives and records missing initiator names',async t=>{
 const prior=process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL='https://catalog.example.test';t.after(()=>{if(prior===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL=prior;});let resolve;t.mock.method(globalThis,'fetch',()=>new Promise(done=>{resolve=done;}));show({before:'older'},catalog([paper({title:null,authors:null,initiated_by:null})]));await screen.findByText('Reading paper title…');assert.ok(screen.getByText('Name unavailable'));assert.ok(screen.getByRole('link',{name:'Newest assessments'}));assert.equal(screen.queryByRole('link',{name:'Older assessments'}),null);resolve(Response.json({version:'research-paper-catalog-v1',access:'public-read-only',id,title:'Retained metadata title',authors:['Retained Author']}));await screen.findByRole('link',{name:'Retained metadata title'});assert.ok(screen.getByText('Retained Author'));
});

test('card view, personal scope and name filters survive view and pagination links', async () => {
  globalThis.__assessmentPreferences = {userId: 'owner'};
  const requests = [];
  globalThis.__assessmentLoad = async (options, signal) => {requests.push({options, signal}); return catalog([paper({workflow_status: null, published: true, initiated_by: null})], 'next-page');};
  const {container} = show({mine: true, view: 'card', name: 'Fixture', before: 'older-page'});
  await screen.findByRole('article');
  assert.equal(screen.queryByRole('table'), null);
  assert.match(screen.getByRole('article').textContent, /Initiated by: Name unavailable/);
  assert.equal(container.querySelectorAll('[data-slot="badge"]').length, 1); // No synthetic stage badge.
  assert.ok(screen.getByText('Published assessment'));
  const older = new URL(screen.getByRole('link', {name: 'Older assessments'}).href);
  assert.equal(older.searchParams.get('mine'), '1'); assert.equal(older.searchParams.get('view'), 'card');
  assert.equal(older.searchParams.get('name'), 'Fixture'); assert.equal(older.searchParams.get('before'), 'next-page');
  assert.equal(new URL(screen.getByRole('link', {name: 'Newest assessments'}).href).searchParams.has('before'), false);
  assert.equal(container.querySelector('input[name="mine"]').value, '1');
  assert.equal(container.querySelector('input[name="view"]').value, 'card');
  assert.deepEqual(requests[0].options, {userId: 'owner', before: 'older-page', name: 'Fixture'});
  assert.equal(requests[0].signal.aborted, false);
  assert.ok(screen.getByRole('button', {name: 'Clear'}));
});

test('personal lists wait for sign-in and retain the requested filters in the login link', () => {
  let calls = 0;
  globalThis.__assessmentLoad = async () => {calls++; return catalog([]);};
  globalThis.__assessmentPreferences = {loading: true};
  const {rerender} = show({mine: true, name: 'Target', view: 'card'});
  assert.equal(screen.getByRole('status').textContent, 'Checking sign-in…'); assert.equal(calls, 0);
  globalThis.__assessmentPreferences = {loading: false};
  rerender(React.createElement(Assessments, {mine: true, name: 'Target', view: 'card'}));
  const login = new URL(screen.getByRole('link', {name: 'Sign in'}).href);
  assert.equal(login.searchParams.get('next'), '/research-verification/assessments?mine=1&view=card&name=Target');
  assert.equal(calls, 0);
});

test('authentication errors expose a retry without loading an unscoped personal list', () => {
  let retries = 0, calls = 0;
  globalThis.__assessmentPreferences = {loading: false, error: 'Session check failed', refresh() {retries++;}};
  globalThis.__assessmentLoad = async () => {calls++; return catalog([]);};
  show({mine: true});
  assert.match(screen.getByRole('alert').textContent, /Session check failed/);
  fireEvent.click(screen.getByRole('button', {name: 'Retry sign-in check'}));
  assert.equal(retries, 1); assert.equal(calls, 0);
});

test('failed catalogue retrieval can retry without preserving a partial list', async () => {
  let calls = 0;
  globalThis.__assessmentLoad = async () => {if (++calls === 1) throw new Error('Catalogue unavailable'); return catalog([paper()]);};
  show();
  assert.match((await screen.findByRole('alert')).textContent, /Catalogue unavailable/);
  assert.equal(screen.queryByRole('table'), null);
  fireEvent.click(screen.getByRole('button', {name: 'Try again'}));
  await screen.findByRole('table');
  assert.equal(calls, 2); assert.equal(screen.queryByRole('alert'), null);
});

test('untyped failures do not imply that assessment counts are known', async () => {
  globalThis.__assessmentLoad = async () => {throw null;}; show();
  assert.match((await screen.findByRole('alert')).textContent, /Counts are unknown/);
});

test('empty lists distinguish name matches, older pages, personal lists and public submissions', async () => {
  for (const [props, expected] of [[{name: 'Target'}, 'No assessments match this name'], [{before: 'cursor'}, 'No assessments on this page'], [{mine: true}, 'You have no assessments yet'], [{}, 'No paper assessments submitted yet']]) {
    globalThis.__assessmentPreferences = {userId: 'owner'};
    show(props, catalog([]));
    await screen.findByRole('heading', {name: expected});
    assert.ok(screen.getByRole('link', {name: props.name ? 'Clear name filter' : 'Assess a paper'}));
    cleanup(); delete globalThis.__assessmentLoad;
  }
});

test('unmount aborts outstanding catalogue reads and ignores late results', async () => {
  let resolve, signal;
  globalThis.__assessmentLoad = (_options, value) => {signal = value; return new Promise(done => {resolve = done;});};
  const {unmount} = show({name: 'Target'});
  assert.equal(screen.getByRole('status').textContent, 'Filtering assessments…');
  unmount(); assert.equal(signal.aborted, true); resolve(catalog([paper()]));
  await waitFor(() => assert.equal(screen.queryByRole('table'), null));
});
