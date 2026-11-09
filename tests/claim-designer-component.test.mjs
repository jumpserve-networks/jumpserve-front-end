import './support/dom.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {emptyIdea} from '../lib/research-ideas.ts';
import {CLAIM_DESIGN_VERSION, CLAIM_DESIGN_RESPONSE_VERSION, saveClaimDesignIntent} from '../lib/research-claim-design.ts';

globalThis.__designReact = React;
const replacements = {
  'next/link': 'export default function Link({href,...props}){return globalThis.__designReact.createElement("a",{...props,href});}',
  '@/lib/research-workflow-api': 'export const researchRequest=(...args)=>globalThis.__designRequest(...args);',
  '@/lib/research-idea-api': 'export const ideaModelRequest=(...args)=>globalThis.__designModel(...args);',
  '@/app/components/research-ideas/idea-workspace': `export function PacketEditor(props){globalThis.__designEditor=props;return globalThis.__designReact.createElement('section',{'aria-label':'Packet editor boundary'},globalThis.__designReact.createElement('button',{onClick:props.onDirty},'Edit draft'),globalThis.__designReact.createElement('button',{onClick:()=>props.onSaved(globalThis.__designSavedId).catch(error=>globalThis.__designChildErrors.push(error))},'Save draft'));}
    export function IdeaActions(props){globalThis.__designActions=props;return globalThis.__designReact.createElement('button',{onClick:()=>props.reload().catch(error=>globalThis.__designChildErrors.push(error))},'Refresh reviews');}
    export function IdeaCampaign(props){globalThis.__designCampaign=props;return globalThis.__designReact.createElement('button',{onClick:()=>props.reload().catch(error=>globalThis.__designChildErrors.push(error))},'Refresh campaign');}`,
};
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {ClaimDesigner} = await import('../app/components/research-workflow/claim-designer.tsx'); hook.deregister();
const ID = '40000000-0000-4000-8000-000000000001', PACKET = '40000000-0000-4000-8000-000000000002', ORIGIN = '40000000-0000-4000-8000-000000000003';
const id = n => '40000000-0000-4000-8000-' + String(n).padStart(12, '0');
const digest = raw => createHash('sha256').update(raw).digest('hex');
const packet = (ident = PACKET, version = 1) => {const document = {...emptyIdea(), hypothesis: 'Exact source claim: latency is 10 ms.'}; const raw = JSON.stringify(document); return {id: ident, study_id: ID, version, document, raw_document: raw, sha256: digest(raw)};};
const output = changes => ({response_version: CLAIM_DESIGN_RESPONSE_VERSION, response_mode: 'propose', summary: 'Original model proposal', questions: [], proposal: null, ...changes});
const run = (n = 1, changes = {}) => ({id: id(n + 100), study_id: ID, packet_id: PACKET, task: 'planning', status: 'complete', reason: null, output: output(), prompt_version_id: id(800), model_id: 'original-model', provenance: {}, usage: {input_tokens: 0}, ...changes});
function fixture(changes = {}) {const document = {study: {id: ORIGIN, title: 'Original paper'}, claim: {id: id(4), description: 'Exact source claim: latency is 10 ms.', location: 'PDF page 2'}, source: {citation: 'Original synthetic paper citation', sha256: 'a'.repeat(64), review_status: 'partial'}, gap: {id: id(5), reason: 'Missing measurements'}}; const raw = JSON.stringify(document); return {version: 'research-ideas-v1', design_version: CLAIM_DESIGN_VERSION, packets: [packet()], runs: [], campaigns: [], decisions: [], ready: false, missing: ['Source-bound configuration'], current_packet_id: PACKET, claim_design: {study_id: ID, sha256: digest(raw), raw_document: raw, document}, ...changes};}
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), originalSetTimeout = globalThis.setTimeout;
let state, calls, models, request, model, view, downloads, revoked, downloadTimers, links, nextId, captureDownloadCleanup;
beforeEach(t => {
  state = fixture(); calls = []; models = []; downloads = []; revoked = []; downloadTimers = []; links = []; nextId = 900; captureDownloadCleanup = false;
  Object.defineProperty(globalThis, 'sessionStorage', {configurable: true, value: window.sessionStorage}); sessionStorage.clear(); globalThis.__designChildErrors = []; globalThis.__designSavedId = PACKET;
  request = async () => structuredClone(state); model = async () => ({run: {status: 'complete', output: {response_mode: 'clarify'}}});
  globalThis.__designRequest = (path, options = {}) => {calls.push({path, options, body: options.body ? JSON.parse(options.body) : null}); return request(path, options);}; globalThis.__designModel = (value, signal) => {models.push({value, signal}); return model(value, signal);};
  t.mock.method(crypto, 'randomUUID', () => id(nextId++)); t.mock.method(URL, 'createObjectURL', blob => {downloads.push(blob); captureDownloadCleanup = true; return 'blob:synthetic-claim-design';}); t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url)); t.mock.method(window.HTMLAnchorElement.prototype, 'click', function () {links.push({href: this.href, download: this.download});});
  t.mock.method(globalThis, 'setTimeout', (callback, ms, ...args) => {if (ms !== 1000 || !captureDownloadCleanup) return originalSetTimeout(callback, ms, ...args); captureDownloadCleanup = false; downloadTimers.push(callback); return 1700;}); t.mock.method(globalThis, 'fetch', () => {assert.fail('No live service may be contacted');});
});
afterEach(() => {cleanup(); sessionStorage.clear(); if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage); else delete globalThis.sessionStorage;});
const button = name => screen.getByRole('button', {name, exact: true});
const click = async element => {await act(async () => fireEvent.click(element));};
const show = () => (view = render(React.createElement(ClaimDesigner, {studyId: ID})));
const ready = async () => {show(); await screen.findByRole('heading', {name: 'Design an experiment for this claim'});};
const form = () => screen.getByRole('textbox', {name: 'Experiment planning message'}).closest('form');
const submit = async () => {await act(async () => fireEvent.submit(form()));};
const writes = () => calls.filter(call => call.options.method === 'POST');

test('loaded design verifies retained hashes and preserves claim source and module navigation', async () => {
  await ready(); assert.equal(calls[0].path, '/studies/' + ID + '/claim-design'); assert.ok(calls[0].options.signal instanceof AbortSignal); assert.ok(screen.getByText('Exact source claim: latency is 10 ms.')); assert.ok(screen.getByText('Source SHA256: ' + 'a'.repeat(64))); assert.match(screen.getByText(/Original synthetic paper citation/).textContent, /PDF page 2.*Source review: partial/); assert.equal(screen.getByRole('link', {name: 'Original assessment'}).getAttribute('href'), '/research-verification/assessments/' + ORIGIN + '?view=gaps'); assert.equal(screen.getByRole('link', {name: 'Experiment Queue'}).getAttribute('href'), '/research-verification/assessment/' + ID + '#experiment-queue'); assert.equal(screen.getByRole('link', {name: 'Evidence workspace'}).getAttribute('href'), '/research-verification/workspace/' + ID); assert.equal(globalThis.__designEditor.planningEndpoint, 'claim-design'); assert.equal(globalThis.__designActions.dirty, false); assert.equal(globalThis.__designCampaign.studyId, ID); assert.ok(screen.getByText(/Missing fields: Source-bound configuration/)); assert.equal(models.length, 0);
});

for (const failure of [new Error('Synthetic design unavailable'), 'unexpected failure']) test('initial read failure retains a retry route: ' + String(failure), async () => {
  request = async () => {throw failure;}; show(); await screen.findByRole('alert'); assert.match(screen.getByRole('alert').textContent, failure instanceof Error ? /Synthetic design unavailable/ : /Request was not confirmed/); request = async () => structuredClone(state); await click(button('Retry loading saved design')); await screen.findByRole('heading', {name: 'Design an experiment for this claim'});
});

test('original claim or packet hash mismatches cannot open an apparently verified editor', async () => {
  for (const where of ['claim', 'packet']) {state = fixture(); if (where === 'claim') state.claim_design.sha256 = 'b'.repeat(64); else state.packets[0].sha256 = 'c'.repeat(64); show(); await screen.findByRole('alert'); assert.equal(screen.getByRole('alert').textContent, 'Retained planning bytes differ from their recorded hash.'); assert.equal(screen.queryByRole('button', {name: 'Design experiment with AI'}), null); view.unmount();}
});

test('aborted initial requests ignore late valid state and errors', async () => {
  for (const rejects of [false, true]) {const pending = deferred(); request = () => pending.promise; show(); const signal = calls.at(-1).options.signal; view.unmount(); assert.equal(signal.aborted, true); await act(async () => rejects ? pending.reject(new Error('Late original failure')) : pending.resolve(structuredClone(state))); assert.equal(screen.queryByRole('heading'), null);}
});

test('planning keeps the exact claim packet stable request identity and conversation across an unfinished attempt', async () => {
  await ready(); model = async () => ({run: {status: 'running', reason: null}}); await submit(); await screen.findByText(/Attempt retained: running/); await submit(); await waitFor(() => assert.equal(screen.getByRole('textbox').disabled, false)); assert.equal(models.length, 2); assert.deepEqual(models[0].value, models[1].value); assert.equal(models[0].value.design_version, CLAIM_DESIGN_VERSION); assert.equal(models[0].value.task, 'planning'); assert.equal(models[0].value.packet_id, PACKET); assert.match(models[0].value.message, /exact paper claim/);
  fireEvent.change(screen.getByRole('textbox'), {target: {value: '  I have original receiver measurements.  '}}); model = async () => ({run: {status: 'complete', output: {response_mode: 'clarify'}}}); await submit(); await screen.findByText(/Questions recorded/); assert.notEqual(models[2].value.request_id, models[1].value.request_id); assert.equal(models[2].value.session_id, models[1].value.session_id); assert.equal(models[2].value.message, 'I have original receiver measurements.'); assert.equal(screen.getByRole('textbox').value, '');
  await click(button('New planning conversation')); assert.ok(screen.getByText('The next request starts a fresh conversation using the saved plan.')); await submit(); await waitFor(() => assert.equal(models.length, 4)); assert.notEqual(models[3].value.session_id, models[2].value.session_id); assert.notEqual(models[3].value.request_id, models[2].value.request_id);
});

test('completed proposals failed attempts and missing reasons retain distinct recorded messages', async () => {
  await ready(); model = async () => ({run: {status: 'complete', output: {response_mode: 'propose'}}}); await submit(); await screen.findByText(/Candidate recorded/); model = async () => ({run: {status: 'invalid-output', reason: 'Original response omitted a field'}}); await submit(); await screen.findByText('Attempt retained: invalid-output. Original response omitted a field'); assert.notEqual(models[0].value.request_id, models[1].value.request_id);
});

test('planning failures retain stable retry identity and an in-flight request is never duplicated', async () => {
  await ready(); const pending = deferred(); model = () => pending.promise; await submit(); assert.equal(screen.getByRole('textbox').disabled, true); await submit(); assert.equal(models.length, 1); await act(async () => pending.reject(new Error('Original dispatch unconfirmed'))); await screen.findByText('Original dispatch unconfirmed'); model = async () => {throw 'unexpected failure';}; await submit(); await screen.findByText(/Request was not confirmed/); assert.equal(models[1].value.request_id, models[0].value.request_id); assert.equal(globalThis.__designActions.dirty, false);
});

test('unmounting aborts planning and does not reload late provider success or failure', async () => {
  for (const rejects of [false, true]) {request = async () => structuredClone(state); await ready(); const pending = deferred(); model = () => pending.promise; await submit(); const call = models.at(-1), count = calls.length; view.unmount(); assert.equal(call.signal.aborted, true); await act(async () => rejects ? pending.reject(new Error('late failure')) : pending.resolve({run: {status: 'complete'}})); assert.equal(calls.length, count); assert.equal(screen.queryByRole('heading'), null);}
});

test('dirty editor changes block planning and a matching saved version enables reviews again', async () => {
  await ready(); await click(button('Edit draft')); assert.equal(button('Design experiment with AI').disabled, true); assert.equal(globalThis.__designActions.dirty, true); assert.equal(globalThis.__designCampaign.dirty, true); await submit(); assert.equal(models.length, 0); assert.ok(screen.getByText('Save your editor changes before requesting or adopting another proposal.'));
  const next = packet(id(20), 2); state.packets.push(next); state.current_packet_id = next.id; globalThis.__designSavedId = next.id; await click(button('Save draft')); await waitFor(() => assert.match(screen.getByText(/Saved version 2/).textContent, /Source-bound configuration/)); assert.equal(globalThis.__designActions.dirty, false); assert.equal(button('Design experiment with AI').disabled, false); await click(button('Refresh reviews')); await click(button('Refresh campaign')); assert.equal(globalThis.__designChildErrors.length, 0);
});

test('a concurrently saved newer packet cannot silently replace dirty editor text', async () => {
  await ready(); await click(button('Edit draft')); const next = packet(id(20), 2); state.packets.push(next); state.current_packet_id = next.id; globalThis.__designSavedId = id(21); await click(button('Save draft')); await waitFor(() => assert.equal(globalThis.__designChildErrors.length, 1)); assert.match(globalThis.__designChildErrors[0].message, /newer plan was saved elsewhere/); assert.ok(screen.getByText(/Saved version 1/)); assert.equal(globalThis.__designActions.dirty, true);
});

test('source planning intent is consumed once and existing attempts prevent automatic repeat inference', async () => {
  saveClaimDesignIntent(ID); await ready(); await waitFor(() => assert.equal(models.length, 1)); assert.equal(sessionStorage.getItem('claim-design-start-v1:' + ID), null); await click(button('Refresh reviews')); assert.equal(models.length, 1); view.unmount(); models = []; state = fixture({runs: [run()]}); saveClaimDesignIntent(ID); await ready(); await waitFor(() => assert.equal(sessionStorage.getItem('claim-design-start-v1:' + ID), null)); assert.equal(models.length, 0);
});

test('adoption binds exact run and packet identities and preserves them through a failed retry', async () => {
  state.runs = [run(1, {output: output({proposal: {original: true}})})]; await ready(); const target = button('Adopt proposal as a new draft'); let attempts = 0; request = async (_path, options) => {if (options.method === 'POST' && attempts++ === 0) throw new Error('Adoption acknowledgement unconfirmed'); return options.method === 'POST' ? {adoption: {new_packet_created: true}} : structuredClone(state);}; await click(target); await screen.findByText('Adoption acknowledgement unconfirmed'); await click(target); await screen.findByText(/New draft version saved/); assert.deepEqual(writes()[0].body, writes()[1].body); assert.equal(writes()[0].body.action, 'adopt'); assert.equal(writes()[0].body.run_id, state.runs[0].id); assert.equal(writes()[0].body.packet_id, PACKET);
});

test('reuse adoption preserves the saved version and invalid older proposals remain references', async () => {
  const old = packet(id(20), 2); state.packets.push(old); state.runs = [run(1, {output: output({response_mode: 'reuse', proposal: {retained: true}})}), run(2, {output: output({response_version: 'old-version', proposal: {legacy: true}})}), run(3, {packet_id: old.id, output: output({proposal: {prior: true}})})]; await ready(); assert.equal(screen.getAllByRole('button', {name: 'Adopt proposal as a new draft'}).every(button => button.disabled), true); assert.ok(screen.getByText(/Earlier proposal retained for reference/)); request = async (_path, options) => options.method === 'POST' ? {adoption: {new_packet_created: false}} : structuredClone(state); await click(button('Use this saved plan')); await screen.findByText(/Its version and review budget are unchanged/); assert.ok(screen.getByText(/Saved version 1/)); await click(button('Edit draft')); assert.equal(button('Use this saved plan').disabled, true);
});

test('two adoption clicks in the same event batch preserve only one request', async () => {
  state.runs = [run(1, {output: output({proposal: {original: true}})})]; await ready(); const pending = deferred(); request = async (_path, options) => options.method === 'POST' ? pending.promise : structuredClone(state); const target = button('Adopt proposal as a new draft');
  await act(async () => {target.dispatchEvent(new window.MouseEvent('click', {bubbles: true})); target.dispatchEvent(new window.MouseEvent('click', {bubbles: true}));}); assert.equal(writes().length, 1); await act(async () => pending.resolve({adoption: {new_packet_created: true}})); await screen.findByText(/New draft version saved/);
});

test('unknown converted-value agreement remains unknown instead of being reported as different', async () => {
  state.runs = [run(1, {output: output({unit_conversions: [{source_value: 1, source_unit: 's', value_ms: 1000, source_quote: 'Owner supplied 1 second'}], converted_values_equal: null})})]; await ready(); assert.ok(screen.getByText(/1 s = 1000 ms/)); assert.equal(screen.queryByText(/The converted numeric values/), null);
});

test('run rendering preserves questions conversions server guidance and recorded provenance without adopting a threshold', async () => {
  const conversions = [{source_value: 1, source_unit: 's', value_ms: 1000, source_quote: 'Original owner supplied 1 second'}]; state.runs = [run(1, {output: output({response_mode: 'clarify', summary: 'Original clarification', rendering: {summary_origin: 'server-mode-status'}, guidance: [{code: 'clock', text: 'Original clock guidance'}], unit_conversions: conversions, converted_values_equal: true, questions: ['Which original clock was used?'], decision_policy: {version: 'decision-v1'}})}), run(2, {output: output({summary: 'Reused configuration retained', unit_conversions: conversions, converted_values_equal: false, decision_policy: {version: 'decision-v1', protocol_reused: true}})}), run(3, {reason: 'Original retry reason', output: output({summary: 'AI candidate', decision_policy: {version: 'decision-v1', protocol_reused: false}})}), run(4, {status: 'failed', output: null}), run(5, {task: 'critic', session_id: null, provenance: {context_policy: 'fresh-packet-only', history_messages: 0}, output: null})]; await ready(); assert.ok(screen.getByText('JumpServe: Original clarification')); assert.ok(screen.getByText('Original clock guidance')); assert.ok(screen.getByText('Which original clock was used?')); assert.ok(screen.getByText(/converted numeric values are equal/)); assert.ok(screen.getByText(/converted numeric values differ/)); assert.ok(screen.getByText(/No proposal was created/)); assert.ok(screen.getByText(/saved protocol was referenced/)); assert.ok(screen.getByText(/AI authored the proposal text/)); assert.equal(screen.getAllByText('Prompt, evidence and usage').length, 4); assert.ok(screen.getByText('Original retry reason'));
});

test('missing source identity and current packet stay unavailable rather than fabricated', async () => {
  state.claim_design.document.source.sha256 = null; state.claim_design.raw_document = JSON.stringify(state.claim_design.document); state.claim_design.sha256 = digest(state.claim_design.raw_document); state.current_packet_id = null; state.packets = []; state.missing = []; await ready(); assert.ok(screen.getByText(/Unavailable; original bytes must be identified/)); assert.ok(screen.getByText(/Saved version unknown/)); assert.ok(screen.getByText(/None reported by structural checks/)); assert.equal(button('Design experiment with AI').disabled, true); assert.equal(globalThis.__designEditor.packet, null); await submit(); assert.equal(models.length, 0);
});

test('download retains the full verified state and revokes its object URL after use', async () => {
  await ready(); await click(button('Download experiment design')); await waitFor(() => assert.equal(downloads.length, 1)); assert.equal(downloads[0].type, 'application/json'); assert.deepEqual(JSON.parse(await downloads[0].text()), state); assert.equal(links[0].download, 'claim-experiment-design-' + ID + '.json'); assert.equal(links[0].href, 'blob:synthetic-claim-design'); assert.equal(revoked.length, 0); downloadTimers[0](); assert.deepEqual(revoked, ['blob:synthetic-claim-design']);
});

test('download reports a browser cryptography failure without exporting unverified bytes', async t => {
  await ready(); t.mock.method(crypto.subtle, 'digest', async () => {throw new Error('Synthetic browser hashing unavailable');}); await click(button('Download experiment design')); await screen.findByText('Synthetic browser hashing unavailable'); assert.equal(downloads.length, 0); assert.deepEqual(links, []);
});
