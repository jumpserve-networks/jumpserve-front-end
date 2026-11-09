import './support/dom.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {emptyIdea, IDEA_VERSION} from '../lib/research-ideas.ts';
import {RECORD_KINDS} from '../lib/research-workflow.ts';

globalThis.__ideaReact = React;
const ideaButton=new URL('../app/components/ui/button.tsx',import.meta.url).href;
const replacements = {
  '@/app/components/ui/button':`import {Button as Original} from ${JSON.stringify(ideaButton)};export function Button(props){globalThis.__ideaActions.set(props.children,props);return globalThis.__ideaReact.createElement(Original,props);}`,
  'next/link': "export default function Link({prefetch,...props}){return globalThis.__ideaReact.createElement('a',props);}",
  'next/navigation': 'export function useRouter(){return {push:path=>globalThis.__ideaPush(path)};}',
  '@/lib/research-workflow-api': 'export const researchRequest=(...args)=>globalThis.__ideaRequest(...args);',
  '@/lib/research-idea-api': 'export const ideaModelRequest=(...args)=>globalThis.__ideaModel(...args);',
  '@/app/components/research-workflow/claim-queue': "export function ClaimQueue(props){return globalThis.__ideaReact.createElement('section',{'aria-label':'Evidence queue boundary'},'Recorded scientific runs: '+props.snapshot.records.runs.length);}",
  './network-protocol-editor': "export function NetworkProtocolEditor(props){return globalThis.__ideaReact.createElement('button',{type:'button',onClick:()=>props.onChange(globalThis.__ideaProtocol)},'Apply fixture protocol');}",
  './idea-review-sources': "export function IdeaReviewSources(){return null;}",
  './idea-guide': "export function IdeaGuide(props){globalThis.__ideaGuide=props;return globalThis.__ideaReact.createElement('section',{'aria-label':'Guide boundary'},globalThis.__ideaReact.createElement('button',{type:'button',onClick:props.onDirty},'Edit fixture guide'),globalThis.__ideaReact.createElement('button',{type:'button',onClick:props.onDiscard},'Discard fixture guide'),props.children);}",
};
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {IdeaIntake, PacketEditor, IdeaActions, IdeaCampaign, IdeaWorkspace} = await import('../app/components/research-ideas/idea-workspace.tsx'); hook.deregister();
const ID = '11111111-1111-4111-8111-111111111111', PACKET = '22222222-2222-4222-8222-222222222222', STAMP = '2026-11-07T00:00:00Z';
const uid = index => '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
const digest = raw => createHash('sha256').update(raw).digest('hex');
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
let calls, modelCalls, pushes, state, snapshot, capabilities, request, model, saved, dirty, editing, reloads, jobs;
function packet(id = PACKET, document = {...emptyIdea(), question: 'Synthetic prospective question'}) {const raw = JSON.stringify(document); return {id, study_id: ID, version: id === PACKET ? 1 : 2, supersedes_id: id === PACKET ? null : PACKET, document, raw_document: raw, sha256: digest(raw), reason: 'Original retained draft', created_at: STAMP};}
function run(task, index, changes = {}) {return {id: uid(index), study_id: ID, packet_id: PACKET, task, session_id: task === 'planning' ? uid(200) : null, status: 'complete', reason: null, output: {summary: 'Synthetic saved recommendation', questions: [], findings: [], verdict: 'ready'}, model_id: 'recorded-model', prompt_version_id: uid(100), provenance: task === 'planning' ? {} : {context_policy: 'fresh-packet-only', history_messages: 0}, usage: {input_tokens: 0, output_tokens: null}, created_at: STAMP, ...changes};}
function fixture(ready = false) {const runs = ready ? [run('comprehension', 1), run('critic', 2)] : []; return {version: IDEA_VERSION, packets: [packet()], current_packet_id: PACKET, runs, decisions: ready ? [{id: uid(3), study_id: ID, packet_id: PACKET, comprehension_run_id: uid(1), critic_run_id: uid(2), decision: 'ready'}] : [], campaigns: [], ready, missing: [], limitations: 'Synthetic local component fixture'};}
beforeEach(() => {
  globalThis.__ideaActions=new Map();
  calls = []; modelCalls = []; pushes = []; saved = []; dirty = []; editing = []; reloads = 0; state = fixture(); jobs = [{request_id: uid(10), campaign_id: uid(20), execution_mode: 'automatic', raw_input: JSON.stringify({runner: 'netem-iperf-v1'})}];
  snapshot = {access: 'owner-draft', study: {id: ID, title: 'Retained private idea', study_kind: 'idea'}, records: Object.fromEntries(RECORD_KINDS.map(name => [name, []])), coverage: Object.fromEntries(RECORD_KINDS.map(name => [name, 0]))};
  capabilities = {ideas: {version: IDEA_VERSION}, networking: {runners: [{id: 'netem-iperf-v1', enabled: true}]}, queue: {workers_enabled: true}};
  request = async (path, options, body) => {
    if (path === '/capabilities') return structuredClone(capabilities);
    if (body?.paper) return {id: body.request_id, study_kind: 'idea', paper_url: null};
    if (body?.action === 'save') return {...packet(body.request_id, body.document), study_id: path.split('/')[2], supersedes_id: body.supersedes_id};
    if (body?.action === 'prepare-campaign') return {link: {id: body.request_id, study_id: ID}, queue_request: jobs[0], queue_requests: jobs};
    if (body?.action === 'resume-campaign') return {queue_request: jobs[0], queue_requests: jobs};
    if (path.endsWith('/queue')) return {job: {id: body.request_id, study_id: ID, campaign_id: body.campaign_id}};
    if (body?.action === 'accept') return {};
    if (path.endsWith('/idea')) return structuredClone(state);
    if (path === '/studies/' + ID) return structuredClone(snapshot);
    throw Error('Unexpected synthetic request: ' + path);
  };
  model = async () => ({run: {status: 'complete', reason: null}});
  globalThis.__ideaRequest = (path, options = {}) => {const body = options.body ? JSON.parse(options.body) : undefined; calls.push({path, options, body}); return request(path, options, body);};
  globalThis.__ideaModel = (...args) => {modelCalls.push(args); return model(...args);}; globalThis.__ideaPush = path => pushes.push(path); globalThis.__ideaProtocol = '{"synthetic_protocol":true}'; globalThis.__ideaGuide = null;
});
afterEach(cleanup);
const show = async (Component, props = {}) => {let view; await act(async () => {view = render(React.createElement(Component, props));}); return view;};
const click = async name => {await act(async () => {fireEvent.click(screen.getByRole('button', {name, exact: true}));});};
const submit = async form => {await act(async () => {fireEvent.submit(form);});};
const change = (name, value) => fireEvent.change(screen.getByRole('textbox', {name, exact: true}), {target: {value}});
const reload = async () => {reloads++;};
const writes = action => calls.filter(call => call.body?.action === action);

test('idea intake confirms both saved identities before navigating and preserves the owner question', async () => {
  await show(IdeaIntake); change('Idea title', 'Owner idea'); change('Research domain', 'Networking'); change('Research question', 'What changes the measured outcome?'); change('Proposed hypothesis, if you have one', 'Untested prospective hypothesis');
  await submit(screen.getByRole('form', {name: 'New unpublished research idea'}));
  assert.equal(calls.length, 3); const create = calls[1].body, save = calls[2].body;
  assert.equal(create.paper.study_kind, 'idea'); assert.equal(create.paper.paper_url, null); assert.equal(save.document.question, 'What changes the measured outcome?'); assert.equal(save.document.protocol, null); assert.equal(save.document.hypothesis, 'Untested prospective hypothesis'); assert.equal(save.supersedes_id, null);
  assert.deepEqual(pushes, ['/research-ideas/ideas/' + create.request_id]); assert.equal(screen.getByRole('link', {name: 'Resume this workspace'}).getAttribute('href'), pushes[0]); assert.equal(screen.getByRole('textbox', {name: 'Idea title'}).disabled, true);
});

test('interrupted initial save keeps its stable packet identity and saved-study link without creating a replacement study', async () => {
  const original = request; let failures = 1; request = async (...args) => args[2]?.action === 'save' && failures-- > 0 ? {id: uid(999), study_id: ID} : original(...args);
  await show(IdeaIntake); change('Idea title', 'Preserved idea'); change('Research domain', 'Networks'); change('Research question', 'Original question'); const form = screen.getByRole('form', {name: 'New unpublished research idea'});
  await submit(form); assert.match(screen.getByRole('alert').textContent, /persistence was not confirmed/); const firstCreate = calls.find(call => call.body?.paper).body.request_id, firstSave = writes('save')[0].body.request_id; assert.deepEqual(pushes, []);
  await submit(form); assert.equal(calls.filter(call => call.body?.paper).at(-1).body.request_id, firstCreate); assert.equal(writes('save').at(-1).body.request_id, firstSave); assert.equal(pushes[0], '/research-ideas/ideas/' + firstCreate);
});

test('unsupported capabilities and unconfirmed study origin stop intake before any packet save', async () => {
  capabilities.ideas.version = 'older'; await show(IdeaIntake); change('Research question', 'Keep my unsaved question'); const form = screen.getByRole('form', {name: 'New unpublished research idea'});
  await submit(form); assert.match(screen.getByRole('alert').textContent, /does not yet support/); assert.equal(calls.length, 1);
  capabilities.ideas.version = IDEA_VERSION; const original = request; request = async (...args) => args[2]?.paper ? {id: args[2].request_id, study_kind: 'paper', paper_url: 'https://synthetic.invalid'} : original(...args);
  await submit(form); assert.match(screen.getByRole('alert').textContent, /identity or origin was not confirmed/); assert.equal(writes('save').length, 0); assert.equal(screen.getByRole('textbox', {name: 'Research question'}).value, 'Keep my unsaved question'); assert.deepEqual(pushes, []);
});

test('packet editor retains immutable predecessor and request identity through a failed save and assigns a new identity after edits', async () => {
  const original = request; let attempts = 0; request = async (...args) => args[2]?.action === 'save' && attempts++ === 0 ? {id: uid(999), supersedes_id: PACKET} : original(...args);
  await show(PacketEditor, {packet: state.packets[0], studyId: ID, onSaved: async id => saved.push(id), onDirty: () => dirty.push(true)});
  change('Research question', 'Changed prospective question'); change('Why this version changed', 'Owner clarification'); const form = screen.getByRole('form', {name: 'Versioned idea plan'});
  await submit(form); assert.match(screen.getByRole('alert').textContent, /not confirmed saved/); const first = writes('save')[0].body; assert.equal(first.supersedes_id, PACKET); assert.equal(first.document.question, 'Changed prospective question'); assert.deepEqual(saved, []);
  await submit(form); assert.equal(writes('save').at(-1).body.request_id, first.request_id); assert.deepEqual(saved, [first.request_id]);
  await click('Apply fixture protocol'); change('Why this version changed', 'New protocol draft'); await submit(form); const latest = writes('save').at(-1).body; assert.notEqual(latest.request_id, first.request_id); assert.deepEqual(latest.document.protocol, {synthetic_protocol: true}); assert.equal(latest.supersedes_id, PACKET); assert.ok(dirty.length >= 2);
});

test('packet JSON errors preserve the draft and assessment plans retain readonly frozen hypothesis and decision fields', async () => {
  await show(PacketEditor, {packet: state.packets[0], studyId: ID, planningEndpoint: 'claim-design', onSaved: async id => saved.push(id), onDirty: () => dirty.push(true)});
  assert.equal(screen.getByRole('textbox', {name: 'Proposed hypothesis'}).readOnly, true); assert.equal(screen.getByRole('textbox', {name: 'What would count against the hypothesis?'}).readOnly, true);
  change('Candidate protocol JSON', '{invalid'); await submit(screen.getByRole('form', {name: 'Versioned assessment plan'})); assert.ok(screen.getByRole('alert')); assert.equal(writes('save').length, 0);
  change('Candidate protocol JSON', 'null'); change('Why this version changed', 'Unfilled draft'); await submit(screen.getByRole('form', {name: 'Versioned assessment plan'})); assert.equal(writes('save')[0].path, '/studies/' + ID + '/claim-design'); assert.equal(writes('save')[0].body.document.protocol, null);
});

test('unconfirmed model attempts reuse the original request and planning session until a completed attempt is retained', async () => {
  state.runs = [run('planning', 9)]; model = async () => ({run: {status: 'running'}}); await show(IdeaActions, {state, studyId: ID, dirty: false, reload}); change('Planning discussion', 'Owner question');
  await click('Send planning question'); assert.ok(screen.getByText(/still unconfirmed/)); const first = modelCalls[0][0]; assert.equal(first.session_id, uid(200)); assert.equal(first.packet_id, PACKET); assert.equal(first.message, 'Owner question');
  await click('Send planning question'); assert.equal(modelCalls[1][0].request_id, first.request_id);
  model = async () => ({run: {status: 'complete', reason: 'Original provider outcome retained'}}); await click('Send planning question'); assert.ok(screen.getByText('Attempt retained: complete. Original provider outcome retained'));
  await click('Send planning question'); assert.notEqual(modelCalls[3][0].request_id, first.request_id); assert.equal(modelCalls[3][0].session_id, first.session_id);
  await click('Start a new planning conversation'); await click('Send planning question'); assert.notEqual(modelCalls[4][0].session_id, first.session_id); assert.equal(reloads, 5);
});

test('fresh reviews omit conversation and readiness requires both latest matching reviews without unsaved changes', async () => {
  state = fixture(true); state.ready = false; state.runs.push(run('planning', 8, {output: {...run('planning', 8).output, questions: ['Original clarification'], findings: [{severity: 'warning', field: 'metrics', message: 'Retained caveat'}]}}));
  await show(IdeaActions, {state, studyId: ID, dirty: false, reload, planningEndpoint: 'claim-design'}); assert.equal(screen.queryByRole('textbox', {name: 'Planning discussion'}), null);
  await click('Request fresh critic review'); assert.equal(modelCalls[0][0].task, 'critic'); assert.equal(Object.hasOwn(modelCalls[0][0], 'session_id'), false); assert.equal(Object.hasOwn(modelCalls[0][0], 'message'), false);
  change('Readiness rationale', 'Addressed original reviews'); await submit(screen.getByRole('button', {name: 'Accept current plan readiness'}).closest('form'));
  const accepted = writes('accept')[0]; assert.equal(accepted.path, '/studies/' + ID + '/claim-design'); assert.equal(accepted.body.comprehension_run_id, uid(1)); assert.equal(accepted.body.critic_run_id, uid(2)); assert.equal(accepted.body.packet_id, PACKET); assert.ok(screen.getByText(/Readiness recorded for this packet/)); assert.ok(screen.getByText('Original clarification')); assert.ok(screen.getByText('Retained caveat'));
  cleanup(); await show(IdeaActions, {state, studyId: ID, dirty: true, reload}); assert.equal(screen.getByRole('button', {name: 'Accept current plan readiness'}).disabled, true); assert.equal(screen.getByRole('button', {name: 'Request fresh critic review'}).disabled, true);
});

test('review quotas disabled readiness and abort on unmount preserve unresolved model request identity', async () => {
  state.runs = [1, 2, 3].map(index => run('critic', index, {status: 'failed', output: null, reason: 'Original failure'})); state.missing = ['Measurements and units']; const pending = deferred(); model = () => pending.promise;
  const view = await show(IdeaActions, {state, studyId: ID, dirty: false, reload}); assert.equal(screen.getByRole('button', {name: 'Request fresh critic review'}).disabled, true); assert.equal(screen.getByRole('button', {name: 'Accept current plan readiness'}).disabled, true);
  const form = screen.getByRole('button', {name: 'Accept current plan readiness'}).closest('form'); await submit(form); assert.equal(writes('accept').length, 0);
  await click('Request fresh comprehension review'); const signal = modelCalls[0][1]; assert.equal(signal.aborted, false); view.unmount(); assert.equal(signal.aborted, true); await act(async () => {pending.resolve({run: {status: 'running'}});});
});

test('campaign preparations freeze the reviewed packet and queue each exact original networking job only when enabled', async () => {
  state = fixture(true); jobs.push({...jobs[0], request_id: uid(11)}); await show(IdeaCampaign, {state, studyId: ID, dirty: false, reload, onEditing: value => editing.push(value)});
  change('Campaign title', 'Prospective local fixture'); fireEvent.change(screen.getByRole('spinbutton', {name: 'Planned experimental units'}), {target: {value: '2'}});
  const form = screen.getByRole('button', {name: 'Freeze reviewed protocol and prepare campaign'}).closest('form'); await submit(form); const prepared = writes('prepare-campaign')[0].body;
  assert.equal(prepared.packet_id, PACKET); assert.equal(prepared.planned_units, 2); assert.equal(prepared.stage, 'pilot'); assert.equal(prepared.experiment_type, 'new-measurement'); assert.equal(editing.at(-1), false);
  await click('Queue 2 networking experiment jobs'); assert.equal(calls.filter(call => call.path.endsWith('/queue')).length, 2); assert.deepEqual(calls.filter(call => call.path.endsWith('/queue')).map(call => call.body), jobs); assert.ok(screen.getByText(/2 automatic networking jobs queued/));
  change('Campaign title', 'Unsaved change'); assert.equal(screen.queryByRole('button', {name: 'Queue 2 networking experiment jobs'}), null); assert.equal(editing.at(-1), true); await click('Discard unsaved campaign details'); assert.equal(screen.getByRole('textbox', {name: 'Campaign title'}).value, ''); assert.equal(editing.at(-1), false);
});

test('prepared campaign resumption respects unavailable workers and runner state, then retries only the saved job identities', async () => {
  state = fixture(true); state.campaigns = [{id: uid(30), campaign_id: uid(20), packet_id: PACKET, study_id: ID, protocol_id: uid(40)}]; capabilities.queue.workers_enabled = false;
  await show(IdeaCampaign, {state, studyId: ID, dirty: false, reload}); await click('Resume queueing this campaign'); assert.equal(writes('resume-campaign')[0].body.prepared_id, uid(30)); assert.equal(screen.getByRole('button', {name: 'Queue 1 networking experiment jobs'}).disabled, true); assert.ok(screen.getByText(/workers are not enabled/));
  capabilities.queue.workers_enabled = true; capabilities.networking.runners[0].enabled = false; await click('Check execution availability again'); assert.ok(screen.getByText(/runner is not enabled/));
  capabilities.networking.runners[0].enabled = true; await click('Check execution availability again'); assert.equal(screen.getByRole('button', {name: 'Queue 1 networking experiment jobs'}).disabled, false);
  const original = request; request = async (...args) => args[0].endsWith('/queue') ? {job: {id: uid(999), campaign_id: uid(20), study_id: ID}} : original(...args);
  await click('Queue 1 networking experiment jobs'); assert.ok(screen.getByText(/Queue persistence was not confirmed/)); request = original; await click('Queue 1 networking experiment jobs'); assert.deepEqual(calls.filter(call => call.path.endsWith('/queue')).map(call => call.body.request_id), [uid(10), uid(10)]);
});

test('manual campaign requests preserve their domain-task status and malformed or unconfirmed preparations remain unqueued', async () => {
  state = fixture(true); jobs = [{request_id: uid(10), campaign_id: uid(20), execution_mode: 'manual'}]; await show(IdeaCampaign, {state, studyId: ID, dirty: false, reload, planningEndpoint: 'claim-design'});
  const form = screen.getByRole('button', {name: 'Freeze reviewed protocol and prepare campaign'}).closest('form'); await submit(form); await click('Queue domain experiment task'); assert.ok(screen.getByText(/Domain task queued/)); assert.equal(writes('prepare-campaign')[0].path, '/studies/' + ID + '/claim-design'); assert.equal(screen.queryByRole('combobox', {name: 'Hypothesis type'}), null);
  const original = request; request = async (...args) => args[2]?.action === 'prepare-campaign' ? {link: {id: uid(999), study_id: ID}} : original(...args); await submit(form); assert.ok(screen.getByText(/Campaign identity was not confirmed saved/));
});

test('workspace rejects incomplete state, retries retained reads, and never replaces a dirty draft during a version conflict', async () => {
  const original = request; let fail = true; request = async (...args) => fail && args[0].endsWith('/idea') ? {version: 'unsupported'} : original(...args);
  await show(IdeaWorkspace, {studyId: ID}); assert.ok(screen.getByRole('alert')); fail = false; await click('Retry loading retained idea'); assert.ok(screen.getByRole('heading', {name: 'Retained private idea'}));
  await click('Detailed editor and history'); await click('Guided conversation'); await click('Edit fixture guide'); await click('Discard fixture guide'); await click('Edit fixture guide'); assert.equal(screen.getByRole('button', {name: 'Detailed editor and history'}).disabled, true);
  const next = packet(uid(500)); state.packets.push(next); state.current_packet_id = next.id;
  // The guide's retained reload callback is the same interface used after a save.
  await act(async () => {await globalThis.__ideaGuide.reload();}); assert.match(screen.getByRole('alert').textContent, /newer plan version was saved elsewhere/); assert.ok(screen.getByText(/packet version 1/));
  await click('Discard this draft and load the newer plan'); assert.ok(screen.getByText(/packet version 2/)); assert.equal(screen.queryByRole('alert'), null); assert.equal(screen.getByRole('button', {name: 'Detailed editor and history'}).disabled, false);
  await click('Detailed editor and history'); assert.ok(screen.getByRole('form', {name: 'Versioned idea plan'})); change('Research question', 'Preserve advanced draft'); assert.equal(screen.getByRole('button', {name: 'Guided conversation'}).disabled, true);
});

test('planning-history downloads verify exact retained packet hashes and preserve unknown usage and recorded zero', async t => {
  let blob, downloads = 0, revoked;
  t.mock.method(URL, 'createObjectURL', value => {blob = value; return 'blob:synthetic-local-test';}); t.mock.method(URL, 'revokeObjectURL', value => {revoked = value;}); t.mock.method(window.HTMLAnchorElement.prototype, 'click', function () {downloads++; assert.equal(this.download, 'research-idea-' + ID + '.json');});
  state.runs = [run('planning', 9)]; await show(IdeaWorkspace, {studyId: ID}); await click('Detailed editor and history'); await click('Download planning history'); await waitFor(() => assert.equal(downloads, 1)); const restored = JSON.parse(await blob.text()); assert.equal(restored.runs[0].usage.input_tokens, 0); assert.equal(restored.runs[0].usage.output_tokens, null); assert.equal(restored.packets[0].raw_document, state.packets[0].raw_document);
  await waitFor(() => assert.equal(revoked, 'blob:synthetic-local-test'), {timeout: 2000});
  state.packets[0].sha256 = '0'.repeat(64); await click('Refresh retained status'); await click('Download planning history'); await waitFor(() => assert.match(screen.getByRole('alert').textContent, /download hash differs/)); assert.equal(downloads, 1);
});

test('aborted initial workspace reads do not render stale private records after unmount', async () => {
  const pending = deferred(); request = () => pending.promise; const view = await show(IdeaWorkspace, {studyId: ID}); assert.ok(screen.getByText('Loading your private research idea…')); const signals = calls.map(call => call.options.signal); view.unmount(); assert.ok(signals.every(signal => signal.aborted)); await act(async () => {pending.reject(new Error('Late retained read failure'));}); assert.equal(screen.queryByRole('alert'), null);
});

test('first-plan recovery keeps the original study and a null predecessor until the first packet is saved', async () => {
  state.packets = []; state.current_packet_id = null; await show(IdeaWorkspace, {studyId: ID}); assert.ok(screen.getByText(/first plan not yet saved/)); assert.ok(screen.getByText(/without creating another study/));
  await click('Detailed editor and history'); change('Research question', 'First saved answer'); change('Why this version changed', 'Initial preserved draft'); await submit(screen.getByRole('form', {name: 'Versioned idea plan'})); assert.equal(writes('save')[0].body.supersedes_id, null); assert.equal(writes('save')[0].body.document.question, 'First saved answer');
});

test('model and acceptance errors retain user input and readiness history without making an additional call automatically', async () => {
  state = fixture(true); state.ready = false; state.runs.push(run('planning', 8, {output: {...run('planning', 8).output, verdict: 'needs-clarification'}})); model = async () => {throw 'Unstructured retained model failure';};
  const original = request; request = async (...args) => {if (args[2]?.action === 'accept') throw Error('Original acceptance is unconfirmed'); return original(...args);};
  await show(IdeaActions, {state, studyId: ID, dirty: false, reload}); change('Planning discussion', 'Keep this question'); await click('Send planning question'); assert.ok(screen.getByText('Request failed. Preserve your input and inspect retained status.')); assert.equal(screen.getByRole('textbox', {name: 'Planning discussion'}).value, 'Keep this question'); assert.equal(modelCalls.length, 1);
  change('Readiness rationale', 'Original acceptance rationale'); await submit(screen.getByRole('button', {name: 'Accept current plan readiness'}).closest('form')); assert.ok(screen.getByText('Original acceptance is unconfirmed')); assert.equal(writes('accept').length, 1);
  cleanup(); state.ready = true; await show(IdeaActions, {state, studyId: ID, dirty: false, reload}); assert.ok(screen.getByText(/Current packet accepted for protocol preparation/)); assert.equal(screen.queryByRole('button', {name: 'Accept current plan readiness'}), null);
});

test('campaign selectors preserve prospective stage method and hypothesis type and claim-design discard restores its frozen defaults', async () => {
  state = fixture(true); await show(IdeaCampaign, {state, studyId: ID, dirty: false, reload});
  for (const [label, option] of [['Campaign stage', 'Main campaign'], ['Hypothesis type', 'numerical'], ['Experiment method', 'broader-validation']]) {
    await act(async () => {fireEvent.click(screen.getByRole('combobox', {name: label, exact: true}));});
    await act(async () => {const item = screen.getByRole('option', {name: option, exact: true}); fireEvent.pointerDown(item, {pointerType: 'mouse', button: 0}); fireEvent.click(item);});
  }
  await submit(screen.getByRole('button', {name: 'Freeze reviewed protocol and prepare campaign'}).closest('form')); const body = writes('prepare-campaign')[0].body; assert.equal(body.stage, 'main'); assert.equal(body.claim_type, 'numerical'); assert.equal(body.experiment_type, 'broader-validation');
  cleanup(); state.packets[0].document.protocol = {stage: 'main', experiment_type: 'independent-check', planned_units: 3}; await show(IdeaCampaign, {state, studyId: ID, dirty: false, reload, planningEndpoint: 'claim-design'}); change('Campaign title', 'Unsaved assessment campaign'); await click('Discard unsaved campaign details'); assert.match(screen.getByRole('combobox', {name: 'Campaign stage'}).textContent, /Main campaign/); assert.match(screen.getByRole('combobox', {name: 'Experiment method'}).textContent, /independent-check/); assert.equal(screen.getByRole('spinbutton', {name: 'Planned experimental units'}).value, '3');
});

test('campaign availability and resumption errors retain the prepared campaign while unreadable runner bytes never enable execution', async () => {
  state = fixture(true); state.campaigns = [{id: uid(30), campaign_id: uid(20), packet_id: PACKET, study_id: ID, protocol_id: uid(40)}]; const original = request; let fail = true;
  request = async (...args) => {if (fail && args[0] === '/capabilities') throw Error('Original availability read failed'); if (fail && args[2]?.action === 'resume-campaign') throw Error('Original campaign read failed'); return original(...args);};
  await show(IdeaCampaign, {state, studyId: ID, dirty: false, reload}); await click('Resume queueing this campaign'); assert.ok(screen.getByText('Original campaign read failed')); fail = false; jobs[0].raw_input = '{invalid'; await click('Resume queueing this campaign'); assert.equal(screen.getByRole('button', {name: 'Queue 1 networking experiment jobs'}).disabled, true); assert.ok(screen.getByText('Original availability read failed'));
  await click('Check execution availability again'); assert.ok(screen.getByText(/runner is not enabled/)); assert.equal(calls.filter(call => call.path.endsWith('/queue')).length, 0);
});
test('prepared automatic jobs wait for their outstanding availability check even through a disabled callback',async()=>{
 state=fixture(true);const pending=deferred(),original=request;request=(...args)=>args[0]==='/capabilities'?pending.promise:original(...args);await show(IdeaCampaign,{state,studyId:ID,dirty:false,reload});await submit(screen.getByRole('button',{name:'Freeze reviewed protocol and prepare campaign'}).closest('form'));assert.ok(screen.getByText('Checking whether this environment can execute the saved experiment…'));const action=globalThis.__ideaActions.get('Queue 1 networking experiment jobs');await act(async()=>action.onClick());assert.equal(calls.filter(call=>call.path.endsWith('/queue')).length,0);await act(async()=>pending.resolve(capabilities));assert.equal(screen.getByRole('button',{name:'Queue 1 networking experiment jobs'}).disabled,false);
});
test('claim-design discard restores explicit pilot defaults when the frozen candidate omits optional stage and method',async()=>{
 state=fixture(true);await show(IdeaCampaign,{state,studyId:ID,dirty:false,reload,planningEndpoint:'claim-design'});change('Campaign title','Unsaved title');await click('Discard unsaved campaign details');assert.match(screen.getByRole('combobox',{name:'Campaign stage'}).textContent,/pilot/);assert.match(screen.getByRole('combobox',{name:'Experiment method'}).textContent,/new-measurement/);
});
test('accepted idea workspaces show readiness and retain their existing scientific run queue',async()=>{
 state=fixture(true);snapshot.records.runs=[{id:uid(301),study_id:ID}];snapshot.coverage.runs=1;await show(IdeaWorkspace,{studyId:ID});assert.ok(screen.getByText(/Plan readiness accepted/));assert.ok(screen.getByRole('region',{name:'Evidence queue boundary'}));assert.ok(screen.getByText('Recorded scientific runs: 1'));
});
