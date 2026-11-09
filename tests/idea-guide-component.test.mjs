import './support/dom.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {emptyIdea, IDEA_VERSION} from '../lib/research-ideas.ts';
import {answerQuestion, GUIDE_QUESTIONS} from '../lib/idea-guide.ts';
import {ResearchRequestError} from '../lib/research-workflow-api.ts';
import {IdeaRequestError} from '../lib/research-idea-api.ts';

globalThis.__guideReact = React; globalThis.__guideWriteError = ResearchRequestError; globalThis.__guideModelError = IdeaRequestError;
const guideButton=new URL('../app/components/ui/button.tsx',import.meta.url).href;
const replacements = {
  '@/lib/research-workflow-api': 'export const researchRequest=(...args)=>globalThis.__guideRequest(...args);export const ResearchRequestError=globalThis.__guideWriteError;',
  '@/lib/research-idea-api': 'export const ideaModelRequest=(...args)=>globalThis.__guideModel(...args);export const IdeaRequestError=globalThis.__guideModelError;',
  '@/app/components/ui/button':`import {Button as Original} from ${JSON.stringify(guideButton)};export function Button(props){globalThis.__guideActions.set(props.children,props);return globalThis.__guideReact.createElement(Original,props);}`,
  './idea-review-sources': "export function IdeaReviewSources(){return null;}",
  './idea-conversation': "export function IdeaConversation(){return globalThis.__guideReact.createElement('section',{'aria-label':'Conversation boundary'},'Retained conversation');}",
  './network-protocol-editor': "export function NetworkProtocolEditor(props){return globalThis.__guideReact.createElement('section',{'aria-label':'Execution editor boundary'},globalThis.__guideReact.createElement('button',{type:'button',onClick:()=>props.onEditing?.()},'Edit fixture execution'),globalThis.__guideReact.createElement('button',{type:'button',onClick:()=>props.onChange(JSON.stringify(globalThis.__guideCompiled))},'Compile fixture execution'));}",
};
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {IdeaGuide} = await import('../app/components/research-ideas/idea-guide.tsx'); hook.deregister();
const ID = '11111111-1111-4111-8111-111111111111', PACKET = '22222222-2222-4222-8222-222222222222', SESSION = '33333333-3333-4333-8333-333333333333', STAMP = '2026-11-07T00:00:00Z';
const uid = index => '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
const hash = raw => createHash('sha256').update(raw).digest('hex');
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
function packet(document = emptyIdea(), id = PACKET, version = 1, supersedes_id = null) {const raw_document = JSON.stringify(document); return {id, study_id: ID, version, supersedes_id, document, raw_document, sha256: hash(raw_document), reason: 'Retained synthetic fixture', created_at: STAMP};}
function completePlan(configured = true) {
  let plan = emptyIdea(); for (const question of GUIDE_QUESTIONS) plan = answerQuestion(plan, question, question.format === 'integer' ? '3' : question.format === 'origin' ? 'software-fixture' : 'Explicit synthetic prospective declaration for ' + question.id, question.format === 'applicability' ? false : undefined);
  if (configured) plan.protocol.execution = {version: 'network-execution-v1', runner: 'custom-package-v1'}; return plan;
}
function run(task, id = uid(100), changes = {}) {return {id, study_id: ID, packet_id: PACKET, task, session_id: task === 'planning' ? SESSION : null, status: 'complete', reason: null, output: {summary: 'Synthetic retained recommendation', verdict: 'ready', questions: task === 'planning' ? ['What is the next testable aspect of your question?'] : [], findings: []}, provenance: task === 'planning' ? {interview: {version: 'idea-interview-v1', owner_message: 'Original owner message'}, provider_message: {content: [{toolUse: {name: 'submit_idea_question', input: {field: 'question'}}}]}} : {context_policy: 'fresh-packet-only', history_messages: 0}, usage: {input_tokens: 0, output_tokens: null}, model_id: 'recorded-model', prompt_version_id: uid(101), created_at: STAMP, ...changes};}
let state, database, view, props, calls, modelCalls, reloads, dirty, discarded, request, model;
beforeEach(() => {
  globalThis.__guideActions=new Map();
  state = {version: IDEA_VERSION, packets: [packet()], current_packet_id: PACKET, runs: [], campaigns: [], decisions: [], missing: [], ready: false, limitations: 'Local synthetic component fixture'}; database = structuredClone(state); view = null; props = {dirty: false, advancedDirty: false, active: true, campaignEditing: false}; calls = []; modelCalls = []; reloads = []; dirty = 0; discarded = 0;
  request = async body => {
    if (body.action === 'save') {const next = {...packet(body.document, body.request_id, database.packets.length + 1, body.supersedes_id), reason: body.reason}; database.packets.push(next); database.current_packet_id = next.id; database.ready = false; return next;}
    if (body.action === 'accept') {database.ready = true; return {};}
    throw Error('Unexpected synthetic write action');
  };
  model = async body => {const result = run(body.task, body.request_id, {packet_id: body.packet_id, session_id: body.session_id ?? null}); database.runs.push(result); return {run: result};};
  globalThis.__guideRequest = (path, options) => {const body = JSON.parse(options.body); calls.push({path, options, body}); return request(body);}; globalThis.__guideModel = (...args) => {modelCalls.push(args); return model(...args);}; globalThis.__guideCompiled = {execution: {version: 'network-execution-v1', runner: 'custom-package-v1'}, synthetic_fixture: true};
});
afterEach(cleanup);
function Harness() {
  const [current, setCurrent] = React.useState(state);
  return React.createElement(IdeaGuide, {...props, state: current, studyId: ID, onDirty: () => dirty++, onDiscard: () => discarded++, reload: async id => {reloads.push(id); state = structuredClone(database); setCurrent(state);}}, React.createElement('p', null, 'Prepared campaign child boundary'));
}
const element = () => React.createElement(Harness);
const show = async () => {database = structuredClone(state); await act(async () => {view = render(element());}); return view;};
const update = async values => {props = {...props, ...values}; await act(async () => {view.rerender(element());});};
const settled = async () => {await waitFor(() => assert.equal(screen.queryByText('Working on your request…'), null));};
const click = async name => {await act(async () => {fireEvent.click(screen.getByRole('button', {name, exact: true}));}); await settled();};
const change = (name, value) => fireEvent.change(screen.getByRole('textbox', {name, exact: true}), {target: {value}});
const submit = async () => {await act(async () => {fireEvent.submit(screen.getByRole('form', {name: 'Answer the research guide'}));}); await settled();};
async function savedQuestion(label, answered = 'answered') {
  const details = screen.getByText('Review saved answers').closest('details'); details.open = true;
  await act(async () => {fireEvent.click(within(details).getByRole('button', {name: label + ' · ' + answered, exact: true}));});
}
async function select(label, option) {
  await act(async () => {fireEvent.click(screen.getByRole('combobox', {name: label, exact: true}));});
  await act(async () => {const item = screen.getByRole('option', {name: option, exact: true}); fireEvent.pointerDown(item, {pointerType: 'mouse', button: 0}); fireEvent.click(item);});
}

test('checklist answers persist only the selected field with an immutable predecessor and advance to the next unresolved question', async () => {
  await show(); assert.ok(screen.getByRole('button', {name: 'Start conversation'})); assert.equal(screen.getByRole('progressbar', {name: 'Answered planning questions'}).value, 0);
  await click('Use checklist instead'); assert.ok(screen.getByRole('heading', {name: 'What do you want to find out?'})); change('Your answer', 'Owner supplied prospective research question'); await submit();
  assert.equal(calls.length, 1); const body = calls[0].body; assert.equal(body.supersedes_id, PACKET); assert.equal(body.reason, 'Guided answer: Research question'); assert.equal(body.document.question, 'Owner supplied prospective research question'); assert.equal(body.document.hypothesis, ''); assert.equal(body.document.protocol, null); assert.deepEqual(modelCalls, []); assert.equal(dirty, 1); assert.equal(discarded, 1); assert.equal(reloads[0], body.request_id); assert.ok(screen.getByRole('heading', {name: 'Why does this question matter?'}));
});

test('empty answers show a local validation error and discarding a draft restores the saved answer without writing', async () => {
  await show(); await click('Use checklist instead'); await submit(); assert.ok(screen.getByRole('alert')); assert.equal(calls.length, 0);
  change('Your answer', 'Unsaved draft'); await click('Discard unsaved answer'); assert.equal(screen.getByRole('textbox', {name: 'Your answer'}).value, ''); assert.equal(screen.queryByRole('alert'), null); assert.equal(discarded, 1); assert.equal(calls.length, 0);
});

test('an interrupted save keeps the exact request identity and owner answer until its original write is confirmed', async () => {
  const original = request; let fail = true; request = async body => fail ? Promise.reject(new Error('Original save acknowledgement missing')) : original(body);
  await show(); await click('Use checklist instead'); change('Your answer', 'Retain this unsaved answer'); await submit(); assert.ok(screen.getByText('Original save acknowledgement missing')); assert.equal(screen.getByRole('textbox', {name: 'Your answer'}).value, 'Retain this unsaved answer'); assert.equal(screen.getByRole('textbox', {name: 'Your answer'}).disabled, true);
  const first = structuredClone(calls[0].body); fail = false; await click('Retry saving the same answer'); assert.deepEqual(calls[1].body, first); assert.equal(database.packets.length, 2); assert.equal(database.packets[0].document.question, ''); assert.ok(screen.getByText(/Answer saved in plan version 2/));
});

test('a definite write rejection allows correction while a mismatched saved identity remains unconfirmed', async () => {
  request = async () => {throw new ResearchRequestError('Original version conflict', 409);}; await show(); await click('Use checklist instead'); change('Your answer', 'Original owner answer'); await submit(); assert.ok(screen.getByText('Original version conflict')); assert.equal(screen.queryByRole('button', {name: 'Retry saving the same answer'}), null); assert.equal(screen.getByRole('textbox', {name: 'Your answer'}).disabled, false);
  request = async body => ({...packet(body.document, uid(999)), study_id: ID, supersedes_id: body.supersedes_id}); change('Your answer', 'Corrected owner answer'); await submit(); assert.ok(screen.getByText(/Saved answer identity was not confirmed/)); assert.ok(screen.getByRole('button', {name: 'Retry saving the same answer'})); assert.notEqual(calls[0].body.request_id, calls[1].body.request_id);
});

test('conversation saves the owner answer before asking a new tailored question using the newly saved packet', async () => {
  state.runs = [run('planning')]; await show(); assert.ok(screen.getByRole('heading', {name: 'What is the next testable aspect of your question?'})); change('Your answer', 'An explicit owner question'); await submit();
  assert.equal(calls[0].body.action, 'save'); assert.equal(modelCalls.length, 1); assert.equal(modelCalls[0][0].packet_id, calls[0].body.request_id); assert.match(modelCalls[0][0].message, /I saved my answer about Research question/); assert.equal(modelCalls[0][0].interview_version, 'idea-interview-v1'); assert.ok(discarded > 0);
});

test('uncertain model requests retain their exact identity and session for retry and definite failures remain editable', async () => {
  model = async () => {throw new IdeaRequestError('Provider acknowledgement is uncertain', true);}; await show(); await click('Start conversation'); assert.equal(modelCalls.length, 1); const first = structuredClone(modelCalls[0][0]); assert.ok(screen.getByText('Provider acknowledgement is uncertain')); assert.ok(screen.getByRole('button', {name: 'Retry the same AI request'}));
  model = async body => {const value = run('planning', body.request_id, {packet_id: body.packet_id, session_id: body.session_id}); database.runs.push(value); return {run: value};}; await click('Retry the same AI request'); assert.deepEqual(modelCalls[1][0], first); assert.equal(screen.queryByRole('button', {name: 'Retry the same AI request'}), null);
  cleanup(); state = {...state, runs: []}; model = async () => {throw new IdeaRequestError('Capability unavailable before admission', false);}; await show(); await click('Start conversation'); assert.ok(screen.getByText('Capability unavailable before admission')); assert.equal(screen.queryByRole('button', {name: 'Retry the same AI request'}), null);
});

test('guide questions and help keep unsaved drafts out of stored facts and rotate bounded conversation history', async () => {
  state.runs = Array.from({length: 4}, (_, index) => run('planning', uid(200 + index))); await show(); change('Your answer', 'Unsaved prospective draft'); await click('Help me answer'); const help = modelCalls[0][0]; assert.notEqual(help.session_id, SESSION); assert.equal(help.preferred_field, 'question'); assert.match(help.message, /unsaved draft \(not a recorded fact\): Unsaved prospective draft/); assert.equal(calls.length, 0);
  change('Ask the guide', 'Clarify this assumption'); await act(async () => {fireEvent.submit(screen.getByRole('form', {name: 'Ask the research guide'}));}); assert.match(modelCalls[1][0].message, /Question for the guide: Clarify this assumption/); assert.equal(screen.getByRole('textbox', {name: 'Ask the guide'}).value, ''); assert.equal(calls.length, 0);
});

test('checklist help uses the saved packet and an explicit unsaved-draft label without changing its version', async () => {
  await show(); await click('Use checklist instead'); change('Your answer', 'Tentative answer'); await click('Help me answer'); assert.match(modelCalls[0][0].message, /not an established fact/); assert.equal(modelCalls[0][0].packet_id, PACKET); assert.equal(calls.length, 0); assert.ok(screen.getByText('AI guidance is ready.'));
});

test('untyped saves and checklist help failures retain the owner draft and bounded fallback diagnostics',async()=>{
 request=async()=>{throw null;};await show();await click('Use checklist instead');change('Your answer','Original unsaved answer');await submit();assert.ok(screen.getByText('The request was not confirmed. Your answer is still here.'));assert.equal(screen.getByRole('textbox',{name:'Your answer'}).value,'Original unsaved answer');cleanup();
 state.runs=[];await show();await click('Use checklist instead');model=async()=>{throw new IdeaRequestError('Original definite help rejection',false);};await click('Help me answer');assert.ok(screen.getByText('Original definite help rejection'));assert.equal(screen.queryByRole('button',{name:'Retry the same AI request'}),null);model=async()=>{throw null;};await click('Help me answer');assert.ok(screen.getByText('The request was not confirmed. Your answer is still here.'));
});

test('checklist retained failures have an explicit missing-reason message and saved flags discard correctly',async()=>{
 state.packets=[packet(completePlan())];await show();await click('Use checklist instead');await savedQuestion('Randomization and seeds');await click('Discard unsaved answer');assert.match(screen.getByRole('combobox',{name:'Randomization and seeds applicability'}).textContent,/Inapplicable/);cleanup();
 state.packets=[packet(emptyIdea())];await show();await click('Use checklist instead');await click('Discard unsaved answer');model=async body=>({run:run('planning',body.request_id,{status:'failed',reason:null,output:null})});await click('Help me answer');assert.ok(screen.getByText(/AI help attempt retained: failed. Refresh its recorded details/));
});

test('native form resubmission cannot save while a prior write or advanced editing is outstanding',async()=>{
 const pending=deferred();request=()=>pending.promise;await show();await click('Use checklist instead');change('Your answer','Original pending answer');await update({advancedDirty:true});await submit();assert.equal(calls.length,0);await update({advancedDirty:false});
 await act(async()=>fireEvent.submit(screen.getByRole('form',{name:'Answer the research guide'})));await act(async()=>fireEvent.submit(screen.getByRole('form',{name:'Answer the research guide'})));assert.equal(calls.length,1);
 const body=calls[0].body;await act(async()=>pending.resolve(packet(body.document,body.request_id,2,body.supersedes_id)));await settled();
});

test('unchanged conversational answers continue with existing evidence without creating a packet version',async()=>{
 state.packets=[packet({...emptyIdea(),question:'Saved original question'})];state.runs=[run('planning')];await show();await savedQuestion('Research question');await submit();assert.equal(calls.length,0);assert.equal(modelCalls.length,1);assert.match(modelCalls[0][0].message,/answer is unchanged/);
});

test('already passed review stages are reused and uncertain or definite review failures retain their identities',async()=>{
 state.packets=[packet(completePlan())];state.runs=[run('comprehension')];await show();await click('Check this plan before running');assert.deepEqual(modelCalls.map(([body])=>body.task),['critic']);cleanup();
 for(const failure of [new IdeaRequestError('Original definite review rejection',false),new Error('Original uncertain review failure')]){state.runs=[];state.packets=[packet(completePlan())];model=async()=>{throw failure;};await show();await click('Check this plan before running');assert.ok(screen.getByText(failure.message));cleanup();}
});

test('disabled parent callbacks reject missing packets and incomplete review authorization',async()=>{
 state.packets=[];state.current_packet_id=null;await show();await act(async()=>globalThis.__guideActions.get('Start conversation').onClick());await click('Use checklist instead');const help=[...globalThis.__guideActions.values()].find(props=>Array.isArray(props.children)&&props.children.includes(' Help me answer'));assert.ok(help);await act(async()=>help.onClick());assert.equal(modelCalls.length,0);cleanup();
 state.packets=[packet(completePlan())];state.current_packet_id=PACKET;await show();await update({dirty:true});await act(async()=>globalThis.__guideActions.get('Check this plan before running').onClick());assert.equal(modelCalls.length,0);
});

test('method answers require applicability and valid integer and origin values before saving', async () => {
  state.packets = [packet(completePlan())]; await show(); await click('Use checklist instead'); await savedQuestion('Randomization and seeds'); change('Your answer', 'Deterministic software fixture only'); await select('Randomization and seeds applicability', 'Inapplicable — explain why'); await submit(); assert.deepEqual(calls.at(-1).body.document.protocol.seeds, {applicable: false, rationale: 'Deterministic software fixture only'});
  await savedQuestion('Observation limit per invocation'); fireEvent.change(screen.getByRole('spinbutton', {name: 'Your answer'}), {target: {value: '0'}}); const before = calls.length; await submit(); assert.ok(screen.getByRole('alert')); assert.equal(calls.length, before); fireEvent.change(screen.getByRole('spinbutton', {name: 'Your answer'}), {target: {value: '7'}}); await submit(); assert.equal(calls.at(-1).body.document.protocol.resource_limits.max_observations, 7);
  await savedQuestion('Origin of the observations'); await select('Your answer', 'Previously recorded data'); await submit(); assert.equal(calls.at(-1).body.document.protocol.data_origin, 'archived-data');
});

test('configuration is an explicit saved version and discarding setup preserves the original method fields', async () => {
  state.packets = [packet(completePlan(false))]; await show(); assert.ok(screen.getByRole('heading', {name: 'How should JumpServe execute this experiment?'})); await click('Edit fixture execution'); await click('Compile fixture execution'); await click('Discard setup changes'); assert.equal(screen.queryByRole('button', {name: 'Save experiment configuration'}), null); assert.ok(screen.getByText(/Unsaved setup changes discarded/)); assert.equal(calls.length, 0);
  await click('Compile fixture execution'); await click('Save experiment configuration'); assert.equal(calls[0].body.reason, 'Guided setup: executable configuration, measurements and resource limits'); assert.deepEqual(calls[0].body.document.protocol, globalThis.__guideCompiled); assert.equal(database.packets[0].document.protocol.execution, undefined);
});

test('complete plans request fresh reviews in order and approval binds the exact packet and latest passing review IDs', async () => {
  state.packets = [packet(completePlan())]; await show(); await click('Check this plan before running'); assert.deepEqual(modelCalls.map(call => call[0].task), ['comprehension', 'critic']); assert.ok(modelCalls.every(call => !Object.hasOwn(call[0], 'session_id') && !Object.hasOwn(call[0], 'message'))); assert.ok(screen.getByText('Both reviews passed. The plan is ready for approval.'));
  const checkbox = screen.getByRole('checkbox', {name: /I have checked the plan/}); await act(async () => {fireEvent.click(checkbox);}); change('Approval rationale', 'The prospective methods and original reviews are consistent'); await act(async () => {fireEvent.submit(screen.getByRole('button', {name: 'Approve reviewed plan'}).closest('form'));});
  const accepted = calls[0].body; assert.equal(accepted.action, 'accept'); assert.equal(accepted.packet_id, PACKET); assert.equal(accepted.comprehension_run_id, database.runs[0].id); assert.equal(accepted.critic_run_id, database.runs[1].id); assert.ok(screen.getByText('Plan approved.')); assert.ok(screen.getByText('Prepared campaign child boundary')); await update({active: false}); assert.equal(screen.queryByText('Prepared campaign child boundary'), null);
});

test('blocking or running reviews stop additional review calls and keep substantive findings visible', async () => {
  state.packets = [packet(completePlan())]; model = async body => {const value = run(body.task, body.request_id, {output: {summary: 'Dependence is unresolved', verdict: 'needs-clarification', questions: ['What is independent?'], findings: [{severity: 'blocking', field: 'dependence', message: 'Retain the clustering limitation'}]}}); database.runs.push(value); return {run: value};}; await show(); await click('Check this plan before running'); assert.equal(modelCalls.length, 1); assert.ok(screen.getByText(/plan needs another look/)); assert.ok(screen.getByText('What is independent?')); assert.ok(screen.getByRole('button', {name: 'Revise dependence structure'})); assert.equal(screen.queryByRole('button', {name: 'Approve reviewed plan'}), null);
  cleanup(); state.runs = [run('critic', uid(3), {status: 'running', output: null})]; await show(); assert.ok(screen.getByText(/A review is still running/)); assert.equal(screen.getByRole('button', {name: 'Check this plan before running'}).disabled, true);
});

test('review quotas unsaved editor state and campaign editing block further requests without discarding the plan', async () => {
  state.packets = [packet(completePlan())]; state.runs = [1, 2, 3].map(index => run('critic', uid(index), {status: 'failed', output: null, reason: 'Original retained failure'})); await show(); assert.ok(screen.getByText(/used its three attempts/)); assert.equal(screen.getByRole('button', {name: 'Check this plan before running'}).disabled, true);
  await update({advancedDirty: true, dirty: true}); assert.ok(screen.getByText(/unsaved changes in the detailed editor/)); assert.equal(screen.getByRole('button', {name: 'Use checklist instead'}).disabled, true); assert.equal(calls.length, 0); assert.equal(modelCalls.length, 0);
  await update({advancedDirty: false, dirty: false, campaignEditing: true}); assert.equal(screen.getByRole('button', {name: 'Use checklist instead'}).disabled, true);
});

test('unchanged answers do not create versions and oversized plans remain unsaved', async () => {
  state.packets = [packet({...emptyIdea(), question: 'Saved original question'})]; await show(); await click('Use checklist instead'); await savedQuestion('Research question'); await submit(); assert.ok(screen.getByText('This answer is already saved. Continue with the next unresolved question.')); assert.equal(calls.length, 0);
  cleanup(); const plan = completePlan(); for (const key of ['problem', 'hypothesis', 'conditions', 'related_work', 'alternatives', 'design', 'metrics', 'controls', 'falsification', 'inputs', 'limitations']) plan[key] = 'x'.repeat(2500); state.packets = [packet(plan)]; state.current_packet_id = PACKET; await show(); await click('Use checklist instead'); await savedQuestion('Research question'); change('Your answer', 'Changed question within an oversized plan'); await submit(); assert.ok(screen.getByText(/24 KB storage limit/)); assert.equal(calls.length, 0);
});

test('unconfirmed planning requests abort their transport on unmount while preserving the original request identity', async () => {
  const pending = deferred(); model = () => pending.promise; await show(); await act(async () => {fireEvent.click(screen.getByRole('button', {name: 'Start conversation'}));}); const signal = modelCalls[0][1]; assert.equal(signal.aborted, false); view.unmount(); assert.equal(signal.aborted, true); await act(async () => {pending.reject(new IdeaRequestError('Original request remains unconfirmed', true));}); assert.equal(calls.length, 0);
});

test('readiness acceptance retries its exact original identity after uncertainty and requires explicit approval and rationale', async () => {
  state.packets = [packet(completePlan())]; state.runs = [run('comprehension', uid(1)), run('critic', uid(2))]; const original = request; let fail = true; request = async body => {if (body.action === 'accept' && fail) throw Error('Original acceptance remains unconfirmed'); return original(body);};
  await show(); const form = screen.getByRole('button', {name: 'Approve reviewed plan'}).closest('form'); await act(async () => {fireEvent.submit(form);}); assert.equal(calls.length, 0);
  await act(async () => {fireEvent.click(screen.getByRole('checkbox', {name: /I have checked the plan/}));}); change('Approval rationale', 'Confirmed prospective methods');
  await act(async () => {fireEvent.submit(form);}); await settled(); assert.ok(screen.getByText('Original acceptance remains unconfirmed')); const first = structuredClone(calls[0].body); fail = false;
  await act(async () => {fireEvent.submit(form);}); await settled(); assert.deepEqual(calls[1].body, first); assert.ok(screen.getByText('Plan approved.'));
});

test('review findings navigate to the bound question in either interface and retained missing fields still block review', async () => {
  state.packets = [packet(completePlan())]; state.missing = ['seeds', 'Recorded external input unavailable']; state.runs = [run('critic', uid(1), {output: {summary: 'Original review concern', verdict: 'needs-clarification', questions: [], findings: [{severity: 'blocking', field: 'dependence', message: 'Retain original dependence concern'}]}})];
  await show(); assert.ok(screen.getByText('Recorded external input unavailable')); assert.equal(screen.getByRole('button', {name: 'Check this plan before running'}).disabled, true); await click('Revise dependence structure'); assert.ok(screen.getByRole('heading', {name: 'Let’s discuss dependence structure'})); await click('Return to the next step');
  await click('Use checklist instead'); await click('Revise dependence structure'); assert.ok(screen.getByRole('heading', {name: 'Which observations might be related to one another?'})); await click('Return to the next step'); assert.ok(screen.getByRole('heading', {name: 'Let’s check for gaps before running anything.'})); assert.equal(calls.length, 0); assert.equal(modelCalls.length, 0);
});
test('questions about a selected review finding retain the preferred field before a tailored AI answer exists',async()=>{
 state.packets=[packet(completePlan())];state.runs=[run('critic',uid(1),{output:{summary:'Original review',verdict:'needs-clarification',questions:[],findings:[{severity:'warning',field:'dependence',message:'Original dependence concern'},{severity:'warning',field:'external-unmapped-field',message:'Original external limitation'}]}})];await show();assert.ok(screen.getByText('warning: Original external limitation'));await click('Revise dependence structure');change('Ask the guide','Explain the retained dependence concern');await act(async()=>fireEvent.submit(screen.getByRole('form',{name:'Ask the research guide'})));await settled();assert.equal(modelCalls[0][0].preferred_field,'dependence');assert.match(modelCalls[0][0].message,/Explain the retained dependence concern/);await click('Continue conversation');assert.equal(modelCalls.at(-1)[0].preferred_field,'dependence');
});

test('execution settings can be opened and closed without writes and an applicability draft discards back to its saved flag', async () => {
  const plan = completePlan(); plan.protocol.seeds = {applicable: true, rationale: 'Original prospective seed assignment'}; state.packets = [packet(plan)]; await show(); await click('Review execution settings'); assert.ok(screen.getByRole('region', {name: 'Execution editor boundary'})); await click('Close execution settings'); assert.equal(screen.queryByRole('region', {name: 'Execution editor boundary'}), null); assert.equal(calls.length, 0);
  await click('Use checklist instead'); await savedQuestion('Randomization and seeds'); change('Your answer', 'Unsaved inapplicability rationale'); await select('Randomization and seeds applicability', 'Inapplicable — explain why'); await click('Discard unsaved answer'); assert.equal(screen.getByRole('textbox', {name: 'Your answer'}).value, 'Original prospective seed assignment'); assert.match(screen.getByRole('combobox', {name: 'Randomization and seeds applicability'}).textContent, /Applicable — specify the method/); assert.equal(calls.length, 0);
});

test('first-plan checklist recovery saves with a null predecessor and does not request a model without a packet', async () => {
  state.packets = []; state.current_packet_id = null; await show(); assert.equal(screen.getByRole('button', {name: 'Start conversation'}).disabled, true); await click('Use checklist instead'); assert.equal(screen.getByRole('button', {name: 'Help me answer'}).disabled, true); change('Your answer', 'First preserved owner question'); await submit(); assert.equal(calls[0].body.supersedes_id, null); assert.equal(database.packets[0].version, 1); assert.equal(database.packets[0].document.question, 'First preserved owner question'); assert.equal(modelCalls.length, 0);
});

test('full coaching histories can start a new bounded session while retaining every earlier turn', async () => {
  state.runs = Array.from({length: 12}, (_, index) => run('planning', uid(200 + index))); await show(); await click('Start a new AI coaching conversation'); assert.ok(screen.getByText(/next help request starts a new planning conversation/)); change('Your answer', 'Prospective draft'); await click('Help me answer'); assert.notEqual(modelCalls[0][0].session_id, SESSION); assert.equal(database.runs.filter(row => row.session_id === SESSION).length, 12); assert.equal(calls.length, 0);
});

test('running and failed planning outcomes remain visible and retries preserve the original request body', async () => {
  model = async body => {const result = run('planning', body.request_id, {status: 'running', output: null}); database.runs.push(result); return {run: result};}; await show(); await click('Start conversation'); assert.ok(screen.getByText(/AI attempt is still running/)); const first = structuredClone(modelCalls[0][0]);
  model = async body => {const result = run('planning', body.request_id, {status: 'complete', session_id: body.session_id}); database.runs = [result]; return {run: result};}; await click('Retry the same AI request'); assert.deepEqual(modelCalls[1][0], first);
  model = async body => ({run: run('planning', body.request_id, {status: 'failed', output: null, reason: null})}); change('Ask the guide', 'Retain the unanswered question'); await act(async () => {fireEvent.submit(screen.getByRole('form', {name: 'Ask the research guide'}));}); await settled(); assert.ok(screen.getByText(/AI turn retained: failed/));
});
