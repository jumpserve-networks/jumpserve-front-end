import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {PAPER_AUTHORS_VERSION, PAPER_SELECTION_VERSION} from '../lib/research-paper-review.ts';

globalThis.__reviewReact = React;
const replacements = {
  'next/link': "export default function Link({prefetch,...props}){return globalThis.__reviewReact.createElement('a',props);}",
  'next/navigation': 'export function useRouter(){return {push:path=>globalThis.__reviewPush(path)};}',
  '@/lib/research-workflow-api': 'export const researchRequest=(...args)=>globalThis.__reviewRequest(...args);',
  '@/app/components/research-workflow/paper-uploads-provider': 'export function usePaperUploads(){return {trackAssessment:(...args)=>globalThis.__reviewTrack(...args)};}',
};
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {PaperReviewPanel} = await import('../app/components/research-workflow/paper-review.tsx'); hook.deregister();
const ID = '11111111-1111-4111-8111-111111111111';
const uid = index => '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
let review, calls, pushes, tracked, read, confirm, organize;
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
function fixture(count = 3) {
  const claims = Array.from({length: count}, (_, index) => ({id: uid(index + 1), description: 'Original source statement ' + (index + 1), location: 'PDF page ' + (index + 1), claim_type: 'numerical', source_id: uid(100)}));
  return {version: 'research-paper-review-v1', id: ID, status: 'ready', revision: 4, title: 'Retained suggested title', domain: 'Networking', reason: null, progress: 'Original extraction completed', can_start: true, authors_version: PAPER_AUTHORS_VERSION, authors: ['Extracted Author'], claims, coverage: {pages: 3}, confirmation: null, limits: {max_spend_cents: null, committed_cents: 0, deadline_at: '2099-01-01T00:00:00Z'}, organization: {version: PAPER_SELECTION_VERSION, status: 'ready', central_claims: [{claim_id: claims[0].id, label: 'Central statement'}], testable_findings: count > 1 ? [{claim_id: claims[1].id, label: 'Testable statement'}] : [], candidate_count: count, cursor: count, rationale: 'Retained source-linked suggestions'}};
}
function confirmed(body) {return {...structuredClone(review), status: 'confirmed', can_start: false, confirmation: {title: body.title, domain: body.domain, authors: body.authors, claim_ids: body.claim_ids, selection: body.selection}};}
beforeEach(() => {
  review = fixture(); calls = []; pushes = []; tracked = [];
  read = async () => structuredClone(review); confirm = async body => confirmed(body); organize = async () => ({...structuredClone(review), status: 'preparing', can_start: false});
  globalThis.__reviewRequest = async (path, options) => {const body = JSON.parse(options.body); calls.push({path, options, body}); return body.action === 'review' ? read() : body.action === 'confirm' ? confirm(body) : organize();};
  globalThis.__reviewPush = path => pushes.push(path); globalThis.__reviewTrack = (...args) => tracked.push(args);
});
afterEach(cleanup);
const show = async () => {let view; await act(async () => {view = render(React.createElement(PaperReviewPanel, {assessmentId: ID}));}); return view;};
const click = async name => {await act(async () => {fireEvent.click(screen.getByRole('button', {name, exact: true}));});};
const checkbox = name => screen.getByRole('checkbox', {name: new RegExp('^' + name + '(?: |$)')});
const check = async name => {await act(async () => {fireEvent.click(checkbox(name));});};
const submit = async (twice = false) => {await act(async () => {const form = screen.getByRole('form', {name: 'Confirm paper information'}); fireEvent.submit(form); if (twice) fireEvent.submit(form);});};
async function openOther() {
  const details = [...document.querySelectorAll('details')].find(node => node.querySelector('summary')?.textContent.toLowerCase().includes('extracted statements'));
  assert.ok(details); await act(async () => {details.open = true; fireEvent(details, new window.Event('toggle'));}); return details;
}

test('ready review exposes title authors and domain while selecting no suggested statements automatically', async () => {
  await show(); assert.equal(screen.getByRole('textbox', {name: 'Title'}).value, review.title); assert.equal(screen.getByRole('textbox', {name: 'Authors'}).value, 'Extracted Author'); assert.equal(screen.getByRole('textbox', {name: 'Research Domain'}).value, 'Networking');
  assert.equal(checkbox('Assess central claim 1').getAttribute('aria-checked'), 'false'); assert.equal(checkbox('Assess testable finding 1').getAttribute('aria-checked'), 'false');
  assert.equal(screen.getByRole('button', {name: 'Confirm and start assessment'}).disabled, true); assert.ok(screen.getByText('0 central claims and 0 testable findings selected for assessment.'));
  assert.equal(calls[0].path, '/paper-uploads'); assert.deepEqual(calls[0].body, {action: 'review', request_id: ID}); assert.equal(calls[0].options.method, 'POST'); assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('explicit selection and edited bibliography are saved once before tracking and canonical assessment navigation', async () => {
  await show(); await check('Assess central claim 1'); await check('Assess testable finding 1');
  fireEvent.change(screen.getByRole('textbox', {name: 'Title'}), {target: {value: 'Owner confirmed title'}}); fireEvent.change(screen.getByRole('textbox', {name: 'Research Domain'}), {target: {value: 'Controlled networking'}}); fireEvent.change(screen.getByRole('textbox', {name: 'Authors'}), {target: {value: ' Doe, Jane\nMaría José\n'}});
  const pending = deferred(); confirm = () => pending.promise; await submit(true); const sent = calls.filter(call => call.body.action === 'confirm'); assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].body, {action: 'confirm', request_id: ID, revision: 4, title: 'Owner confirmed title', domain: 'Controlled networking', authors: ['Doe, Jane', 'María José'], claim_ids: [uid(1), uid(2)], selection: {central_claims: [uid(1)], testable_findings: [uid(2)]}});
  assert.equal(screen.getByRole('button', {name: 'Starting assessment…'}).disabled, true); assert.deepEqual(pushes, []); assert.deepEqual(tracked, []);
  await act(async () => {pending.resolve(confirmed(sent[0].body));}); assert.deepEqual(tracked, [[ID, 'Owner confirmed title']]); assert.deepEqual(pushes, ['/research-verification/assessment/' + ID + '#experiment-queue']);
  assert.equal(screen.getByRole('textbox', {name: 'Title'}).disabled, true); assert.equal(screen.getByRole('link', {name: 'View assessment progress'}).getAttribute('href'), pushes[0]);
});

test('group selection move and removal preserve source text and keep each selected ID in one group', async () => {
  await show(); await click('Select all central claims'); await click('Select all central claims'); assert.ok(screen.getByText('1 central claims and 0 testable findings selected for assessment.'));
  await click('Clear central claims'); await click('Select all testable findings'); await click('Clear testable findings');
  await check('Assess central claim 1'); await check('Assess central claim 1'); await check('Assess testable finding 1'); await check('Assess testable finding 1');
  await click('Move to testable findings'); assert.equal(screen.getAllByRole('checkbox').length, 2); assert.equal(screen.queryByRole('checkbox', {name: /^Assess central claim 1(?: |$)/}), null);
  const testable = screen.getByRole('group', {name: 'Testable Findings'}); await act(async () => {fireEvent.click(within(testable).getAllByRole('button', {name: 'Move to central claims'})[0]);});
  await check('Assess central claim 1'); const central = screen.getByRole('group', {name: 'Central Claims'}); await act(async () => {fireEvent.click(within(central).getByRole('button', {name: 'Remove from review list'}));});
  assert.ok(screen.getByText('0 central claims and 0 testable findings selected for assessment.')); assert.equal(screen.getByRole('button', {name: 'Confirm and start assessment'}).disabled, true);
  const details = await openOther(); const first = within(details).getAllByRole('button', {name: 'Add to central claims'})[0]; await act(async () => {fireEvent.click(first);});
  assert.ok(checkbox('Assess central claim 1')); assert.ok(screen.getByText(review.claims[0].description));
  const other = within(details).getAllByRole('button', {name: 'Add to testable findings'})[0]; await act(async () => {fireEvent.click(other);}); assert.ok(screen.getAllByRole('checkbox').length >= 2);
});

test('other source statements are bounded searchable and only expanded on request', async () => {
  review = fixture(25); await show(); const details = await openOther(); assert.ok(within(details).getByText('Showing 20 of 23 matching statements.'));
  await click('Show more statements'); assert.ok(within(details).getByText('Showing 23 of 23 matching statements.'));
  fireEvent.change(screen.getByRole('textbox', {name: 'Find extracted statements'}), {target: {value: 'statement 25'}}); assert.ok(within(details).getByText('Showing 1 of 1 matching statements.')); assert.ok(within(details).getByText('Original source statement 25'));
  fireEvent.change(screen.getByRole('textbox', {name: 'Find extracted statements'}), {target: {value: 'unmatched'}}); assert.ok(within(details).getByText('Showing 0 of 0 matching statements.'));
});

test('preparation polls until ready and does not overwrite owner edits on a later reload', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); review.status = 'preparing'; review.can_start = false; review.progress = 'Reading retained PDF page 2'; await show();
  assert.ok(screen.getByRole('heading', {name: 'Preparing your paper…'})); assert.ok(screen.getByText('Reading retained PDF page 2')); assert.ok(screen.getByText('3 candidate claims found so far.'));
  review.status = 'ready'; review.can_start = true; await act(async () => {t.mock.timers.tick(3000);}); assert.equal(calls.length, 2);
  fireEvent.change(screen.getByRole('textbox', {name: 'Title'}), {target: {value: 'Owner edit to keep'}});
  confirm = async () => {throw new Error('Synthetic save interruption');}; await check('Assess central claim 1'); await submit(); assert.ok(screen.getByText('Synthetic save interruption'));
  await click('Reload paper information'); assert.equal(screen.getByRole('textbox', {name: 'Title'}).value, 'Owner edit to keep'); assert.equal(screen.queryByRole('alert'), null);
  const count = calls.length; await act(async () => {t.mock.timers.tick(3000);}); assert.equal(calls.length, count);
});

test('missing metadata legacy author capability and revoked authorization remain explicit and cannot start work', async () => {
  review.title = null; review.domain = null; delete review.authors_version; review.authors = null; review.can_start = false; await show();
  assert.ok(screen.getByText('Title not identified.')); assert.ok(screen.getByText('Research domain not identified.')); assert.equal(screen.getByRole('textbox', {name: 'Authors'}).disabled, true);
  await check('Assess central claim 1'); await submit(); assert.equal(calls.filter(call => call.body.action === 'confirm').length, 0); assert.ok(screen.getByRole('alert'));
  cleanup(); review.title = 'Legacy title'; review.domain = 'Legacy domain'; review.can_start = true; await show(); await check('Assess central claim 1'); await submit(); assert.equal(Object.hasOwn(calls.at(-1).body, 'authors'), false);
});

test('invalid author edits and unconfirmed or failed saves retain the same revision and never navigate', async () => {
  await show(); await check('Assess central claim 1'); fireEvent.change(screen.getByRole('textbox', {name: 'Authors'}), {target: {value: 'private@example.test'}}); await submit(); assert.match(screen.getByRole('alert').textContent, /Names cannot contain contact details/); assert.equal(calls.length, 1);
  fireEvent.change(screen.getByRole('textbox', {name: 'Authors'}), {target: {value: ''}}); confirm = async () => structuredClone(review); await submit(); assert.match(screen.getByRole('alert').textContent, /Assessment start is unconfirmed/);
  confirm = async () => {throw 'Unstructured write failure';}; await submit(); assert.match(screen.getByRole('alert').textContent, /Confirmation could not be saved/); assert.deepEqual(pushes, []); assert.deepEqual(tracked, []);
  assert.ok(calls.filter(call => call.body.action === 'confirm').every(call => call.body.revision === 4));
});

test('failed extraction retains its reason and organization retry failures remain visible', async () => {
  review.status = 'failed'; review.can_start = false; review.reason = null; await show(); assert.ok(screen.getByRole('heading', {name: 'Paper preparation needs attention'})); assert.ok(screen.getByText('The paper could not be fully prepared.'));
  assert.equal(screen.getByRole('link', {name: 'View preparation details'}).getAttribute('href'), '/research-verification/assessment/' + ID + '#experiment-queue');
  organize = async () => {throw new Error('Synthetic organization interruption');}; await click('Organize extracted statements'); assert.ok(screen.getByText('Synthetic organization interruption'));
  organize = async () => {throw 'Unstructured organization error';}; await click('Organize extracted statements'); assert.ok(screen.getByText('Paper organization could not be requested.'));
});

test('unorganized and preparing groups retain candidate coverage and organizing resets only local suggestions', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); review.organization = {...review.organization, status: 'unorganized', central_claims: [], testable_findings: [], cursor: 0}; await show();
  assert.ok(screen.getByRole('heading', {name: 'Central claims and findings have not been organized'})); assert.equal(screen.getAllByText('Suggestions pending.').length, 2);
  const pending = deferred(); organize = () => pending.promise;
  await act(async () => {const button = screen.getByRole('button', {name: 'Organize extracted statements'}); fireEvent.click(button); fireEvent.click(button);});
  assert.equal(calls.filter(call => call.body.action === 'organize').length, 1, 'A batched double click must retain one original organization request');
  assert.equal(screen.getByRole('button', {name: 'Organize extracted statements'}).disabled, true);
  review.organization.status = 'preparing'; review.organization.cursor = 1;
  await act(async () => {pending.resolve(structuredClone(review));}); assert.ok(screen.getByRole('heading', {name: 'Organizing extracted statements'})); assert.ok(screen.getByText('Reviewed 1 of 3 statements for the shortlist. Suggestions are incomplete.'));
  cleanup(); delete review.organization; await show(); assert.ok(screen.getByText('The connected service needs the review-grouping update before a new grouped selection can be saved.')); assert.equal(screen.getByRole('button', {name: 'Confirm and start assessment'}).disabled, true);
});

test('legacy confirmed selections remain read-only even when their group labels were not recorded', async () => {
  review.status = 'confirmed'; review.can_start = false; delete review.organization; review.confirmation = {title: 'Original confirmed title', domain: 'Original domain', claim_ids: [uid(3)], authors: ['Original Author']};
  await show(); assert.ok(screen.getByText('1 statements included in the original assessment; group labels were not recorded.')); assert.equal(screen.getByRole('textbox', {name: 'Title'}).value, 'Original confirmed title');
  assert.equal(screen.getByRole('textbox', {name: 'Authors'}).value, 'Original Author'); const details = await openOther(); assert.ok(within(details).getByText(/Included in the original assessment; category was not recorded/)); assert.equal(screen.queryByRole('button', {name: 'Confirm and start assessment'}), null);
});

test('late successful or failed reads after unmount cannot schedule another preparation poll', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  for (const reject of [false, true]) {
    const pending = deferred(); read = () => pending.promise; const view = await show(); const call = calls.at(-1); view.unmount(); assert.equal(call.options.signal.aborted, true);
    await act(async () => {if (reject) pending.reject(new Error('Abandoned error')); else pending.resolve({...review, status: 'preparing', can_start: false});});
    const count = calls.length; await act(async () => {t.mock.timers.tick(3000);}); assert.equal(calls.length, count); assert.equal(screen.queryByRole('alert'), null);
  }
});

test('initial failures show useful errors and a retry can recover without changing the assessment identity', async () => {
  read = async () => {throw 'Unstructured retrieval error';}; await show(); assert.ok(screen.getByText('Paper information could not be loaded.'));
  read = async () => structuredClone(review); await click('Reload paper information'); assert.ok(screen.getByRole('form', {name: 'Confirm paper information'})); assert.ok(calls.every(call => call.body.request_id === ID));
});
test('typed preparation failures retain diagnostics and failed papers without extracted statements cannot be organized',async()=>{
 read=async()=>{throw new Error('Original paper read failure');};await show();assert.ok(screen.getByText('Original paper read failure'));cleanup();review.status='failed';review.can_start=false;review.claims=[];delete review.organization;read=async()=>structuredClone(review);await show();assert.equal(screen.queryByRole('button',{name:'Organize extracted statements'}),null);assert.ok(screen.getByText('The paper could not be fully prepared.'));
});
test('a response without retained confirmation cannot start an assessment and missing rationale stays absent',async()=>{
 review.organization.rationale='';await show();assert.equal(screen.queryByText('Why these suggestions?'),null);await check('Assess central claim 1');confirm=async()=>structuredClone(review);await submit();assert.ok(screen.getByText('Assessment start is unconfirmed. Retry using this same review.'));assert.deepEqual(tracked,[]);assert.deepEqual(pushes,[]);
});
