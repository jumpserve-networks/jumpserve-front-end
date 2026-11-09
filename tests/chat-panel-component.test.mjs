import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';

const replacements = {
  '@/lib/supabase/client': 'export const createClient=()=>globalThis.__chatDatabase;',
  '@/lib/browser-auth': 'export const requireAccessToken=()=>globalThis.__chatToken();',
  '@/lib/agent-api': 'export const sendMessage=(...args)=>globalThis.__chatSend(...args);',
  '@/app/components/user-preferences': 'export const LocalDateTime=({value})=>value;',
};
const hook = registerHooks({resolve(specifier, context, next) {
  return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);
}});
const {ChatPanel} = await import('../app/components/chat-panel.tsx'); hook.deregister();
let queries, sends, audits, summaries, transcripts, scrolls;
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const saved = (id, text, extra = {}) => ({id, updated_at: '2026-11-01T00:00:00Z', messages: [{role: 'user', content: [{text}]}], ...extra});
const user = text => ({role: 'user', content: [{text}]});
const assistant = text => ({role: 'assistant', content: [{text}]});
beforeEach(() => {
  queries = []; sends = []; audits = []; summaries = []; transcripts = {}; scrolls = [];
  HTMLElement.prototype.scrollIntoView = function(options) {scrolls.push(options);};
  globalThis.__chatList = async () => ({data: summaries, error: null});
  globalThis.__chatRead = async id => ({data: {messages: transcripts[id]}, error: null});
  globalThis.__chatDelete = async () => ({error: null});
  globalThis.__chatAudit = async () => ({data: [], error: null});
  globalThis.__chatToken = async () => 'synthetic-token';
  globalThis.__chatSend = async (...args) => {sends.push(args); return {response: 'Synthetic answer'};};
  globalThis.__chatDatabase = {
    from(table) {
      assert.equal(table, 'agent_sessions');
      const query = {table, filters: [], kind: 'select'};
      const chain = {
        select(columns) {query.columns = columns; return chain;},
        delete() {query.kind = 'delete'; return chain;},
        eq(column, value) {query.filters.push([column, value]); return chain;},
        order(column, options) {query.order = [column, options]; return chain;},
        limit(value) {query.limit = value; queries.push(query); return globalThis.__chatList();},
        single() {queries.push(query); return globalThis.__chatRead(query.filters.find(([k]) => k === 'id')[1]);},
        then(resolve, reject) {assert.equal(query.kind, 'delete'); queries.push(query); return globalThis.__chatDelete(query).then(resolve, reject);},
      }; return chain;
    },
    rpc(name, params) {assert.equal(name, 'get_agent_answer_provenance'); audits.push(params); return globalThis.__chatAudit(params);},
  };
});
afterEach(async () => {await act(async () => {}); cleanup(); delete HTMLElement.prototype.scrollIntoView; for (const name of ['List', 'Read', 'Delete', 'Audit', 'Token', 'Send', 'Database']) delete globalThis['__chat' + name];});
async function show(props = {}) {let view; await act(async () => {view = render(React.createElement(ChatPanel, {userEmail: 'fixture@example.test', ...props}));}); return view;}
const input = () => screen.getByRole('textbox', {name: 'Chat message'});
const type = value => fireEvent.change(input(), {target: {value}});
async function send(value) {type(value); await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Send message'})));}
const newChat = () => fireEvent.click(screen.getByRole('button', {name: '+ New Chat'}));
async function open(id) {await act(async () => fireEvent.click(screen.getByRole('button', {name: new RegExp('^' + id)})));}

test('visits stay empty and query a bounded history by authenticated user and module', async () => {
  summaries = [saved('old', 'Earlier conversation')]; transcripts.old = [user('Earlier private question'), assistant('Earlier private answer')];
  await show({moduleId: 'congestion-control-real-world'});
  assert.ok(screen.getByText('Ask about real-world test results')); assert.equal(screen.queryByText('Earlier private answer'), null);
  assert.deepEqual(queries, [{table: 'agent_sessions', kind: 'select', columns: 'id, updated_at, messages', filters: [['user_id', 'fixture@example.test'], ['module_id', 'congestion-control-real-world']], order: ['updated_at', {ascending: false}], limit: 30}]);
  assert.equal(audits.length, 0); assert.deepEqual(scrolls, [{behavior: 'smooth'}]);
});

test('each module has its own suggestions and selecting one only prepares an editable question', async () => {
  for (const [moduleId, heading, suggestion] of [
    ['congestion-control-emulated', 'Ask me anything about your benchmarks', 'Show my recent jobs'],
    ['congestion-control-real-world', 'Ask about real-world test results', 'Show recent real-world test results'],
    ['leo-emergency-failover', 'Ask about the LEO failover study', "How does terminal placement affect Haiti's capacity?"],
    ['ipv6-dns-study', 'Ask about IPv6 DNS evidence', 'Does the LGI comparison establish a causal effect?'],
    ['reliable-sketch-study', 'Ask about ReliableSketch evidence', 'How does allocated memory differ from nominal memory?'],
    ['http2-compliance-study', 'Ask about HTTP/2 evidence', 'Does rejecting a message prove RFC compliance?'],
  ]) {
    const view = await show({moduleId}); assert.ok(screen.getByText(heading)); fireEvent.click(screen.getByRole('button', {name: suggestion})); assert.equal(input().value, suggestion); assert.equal(sends.length, 0); view.unmount();
  }
});

test('result deep links prefill without sending and history can be shown and hidden', async () => {
  await show({initialMessage: 'Compare the linked job'}); assert.equal(input().value, 'Compare the linked job'); assert.equal(sends.length, 0);
  assert.ok(screen.getByRole('button', {name: 'Show chat history'})); fireEvent.click(screen.getByRole('button', {name: 'Show chat history'}));
  fireEvent.click(screen.getByRole('button', {name: 'Hide chat history'})); assert.ok(screen.getByRole('button', {name: 'Show chat history'}));
});

test('sending trims the question requires a token and preserves session module and answer provenance', async () => {
  globalThis.__chatSend = async (...args) => {sends.push(args); return {response: '| Outcome | Value |\n| --- | --- |\n| Reproduced | 0 |', tool_events: [{name: 'get_real_world_results', input: {jobId: 'fixture'}}, {name: 'future_tool', input: {}}], provenance: {prompt_version: 'fixture-v1', prompt_version_id: 'prompt-id', prompt_content_sha256: 'a'.repeat(64), analysis_version: 'analysis-v1', evidence_sha256: 'b'.repeat(64), renderer_version: 'renderer-v1', read_events: [{id: 'original', value: 0}]}};};
  await show({moduleId: 'congestion-control-real-world'}); await send('  What was measured?  ');
  assert.equal(sends.length, 1); assert.equal(sends[0][0], 'What was measured?'); assert.match(sends[0][1], /^[a-f0-9-]{36}$/); assert.equal(sends[0][2], 'synthetic-token'); assert.equal(sends[0][3], 'congestion-control-real-world');
  assert.ok(screen.getByRole('table')); assert.ok(screen.getByText('Read real-world results')); assert.ok(screen.getByText('future_tool'));
  assert.ok(screen.getByText('Answer provenance · fixture-v1')); assert.ok(screen.getByText(/Evidence SHA-256/)); assert.ok(screen.getByText(/"value": 0/)); assert.equal(input().value, ''); assert.equal(queries.length, 2);
});

test('empty input shift-enter and a pending send do not make extra requests', async () => {
  const pending = deferred(); globalThis.__chatSend = (...args) => {sends.push(args); return pending.promise;}; await show();
  type('   '); fireEvent.keyDown(input(), {key: 'Enter'}); assert.equal(sends.length, 0);
  type('Question\nsecond line'); fireEvent.keyDown(input(), {key: 'Enter', shiftKey: true}); assert.equal(sends.length, 0);
  await act(async () => fireEvent.keyDown(input(), {key: 'Enter'})); assert.equal(sends.length, 1); assert.equal(input().disabled, true);
  fireEvent.keyDown(input(), {key: 'Enter'}); assert.equal(sends.length, 1);
  await act(async () => pending.resolve({response: 'Answer'})); assert.equal(input().disabled, false);
});

test('failed sends restore the draft and visible error for a deliberate retry', async () => {
  await show(); globalThis.__chatToken = async () => {throw new Error('Sign in required');}; await send(' Retained question ');
  assert.ok(screen.getByText('Error: Sign in required')); assert.equal(input().value, 'Retained question'); assert.equal(sends.length, 0);
  globalThis.__chatToken = async () => 'synthetic-token'; globalThis.__chatSend = async () => {throw null;}; await send('Retained question');
  assert.ok(screen.getByText('Error: Unable to send your message. Please try again.')); assert.equal(input().value, 'Retained question');
  globalThis.__chatSend = async () => ({response: 'Recovered answer'}); await send('Retained question'); assert.ok(screen.getByText('Recovered answer'));
});

test('starting a new chat discards late successful and failed responses from the old conversation', async () => {
  for (const fail of [false, true]) {
    const pending = deferred(); globalThis.__chatSend = (...args) => {sends.push(args); return pending.promise;}; const view = await show();
    await send('Old pending question'); const old = sends.at(-1)[1]; newChat(); assert.equal(input().disabled, false);
    await act(async () => fail ? pending.reject(new Error('Old failure')) : pending.resolve({response: 'Old answer'}));
    assert.equal(screen.queryByText('Old answer'), null); assert.equal(screen.queryByText('Error: Old failure'), null); assert.equal(input().value, '');
    globalThis.__chatSend = async (...args) => {sends.push(args); return {response: 'New answer'};}; await send('New question'); assert.notEqual(sends.at(-1)[1], old); view.unmount();
  }
});

test('saved tool calls merge into the next assistant answer and tool results never become user messages', async () => {
  summaries = [saved('mixed', 'Mixed history')]; transcripts.mixed = [null, 0, {}, {role: 'user'}, user('Visible question'), {role: 'user', content: [{toolResult: {content: 'Private tool output'}}]}, {role: 'user', content: [null, {}, 0]}, {role: 'assistant', content: [{toolUse: {name: 'get_run_results', input: {id: 1}}}]}, {role: 'assistant', content: [null, {type: 'tool_use', name: 'compare_runs', input: {}}, {toolUse: {name: 2}}, {type: 'ignored'}]}, {role: 'assistant', content: ['Answer ', {text: 'with tools'}, {type: 'tool_use', name: 'list_jobs', input: {}}]}, {role: 'user', content: 'String question'}, {role: 'assistant', content: 'String answer'}, {role: 'system', content: [{text: 'Hidden system message'}]}];
  await show(); await open('Mixed history'); assert.ok(screen.getByText('Visible question')); assert.ok(screen.getByText('Answer with tools'));
  for (const text of ['Fetched results', 'Compared runs', 'Listed jobs', 'String question', 'String answer']) assert.ok(screen.getByText(text));
  assert.equal(screen.queryByText('Private tool output'), null); assert.equal(screen.queryByText('Hidden system message'), null);
  assert.deepEqual(queries[1].filters, [['user_id', 'fixture@example.test'], ['module_id', 'congestion-control-emulated'], ['id', 'mixed']]);
});

test('saved provenance matches assistant answers in retained order and does not attach unmatched rows', async () => {
  summaries = [saved('audit', 'Audited history')]; transcripts.audit = [user('Question'), assistant('First answer'), assistant('Unmatched answer'), assistant('First answer')];
  globalThis.__chatAudit = async () => ({data: [{response: 'Unused', prompt_version: 'unused'}, {response: 'First answer', prompt_version: 'first', prompt_version_id: 'one', prompt_content_sha256: '1', analysis_version: 'analysis'}, {response: 'First answer', prompt_version: 'second', prompt_version_id: 'two', prompt_content_sha256: '2', analysis_version: 'analysis', answer_provenance: {evidence_sha256: 'original-hash', renderer_version: 'fixed', read_events: []}}], error: null});
  await show({moduleId: 'leo-emergency-failover'}); await open('Audited history');
  assert.ok(screen.getByText('Answer provenance · first')); assert.ok(screen.getByText('Answer provenance · second')); assert.equal(screen.queryByText('Answer provenance · unused'), null);
  assert.deepEqual(audits, [{p_session_id: 'audit', p_module_id: 'leo-emergency-failover'}]);
});

test('missing optional provenance does not hide retained messages', async () => {
  summaries = [saved('missing', 'Missing audit')]; transcripts.missing = [user('Question'), assistant('Retained answer')];
  globalThis.__chatAudit = async () => ({data: null, error: {message: 'unavailable'}});
  await show(); await open('Missing audit'); assert.ok(screen.getByText('Retained answer')); assert.equal(screen.queryByText(/Answer provenance/), null);
});

test('invalid saved messages render an empty conversation without enabling a different identity', async () => {
  summaries = [saved('invalid', 'Invalid messages')]; transcripts.invalid = {not: 'an array'};
  await show({userEmail: undefined}); await open('Invalid messages'); assert.ok(screen.getByText('Ask me anything about your benchmarks'));
  assert.equal(queries[0].filters[0][1], ''); assert.equal(queries[1].filters[0][1], '');
});

test('failed conversation reads block sending until an explicit selection retry succeeds', async () => {
  summaries = [saved('retry', 'Retry history')]; globalThis.__chatRead = async () => ({data: null, error: {message: 'rejected'}});
  await show(); await open('Retry history'); assert.ok(screen.getByText(/Unable to load this conversation/)); type('Pending question');
  assert.equal(screen.getByRole('button', {name: 'Send message'}).disabled, true); fireEvent.keyDown(input(), {key: 'Enter'}); assert.equal(sends.length, 0);
  globalThis.__chatRead = async () => ({data: {messages: [assistant('Recovered history')]}, error: null}); await open('Retry history'); assert.ok(screen.getByText('Recovered history'));
  await send('New question'); assert.equal(sends.at(-1)[1], 'retry');
});

test('switching conversations ignores stale data and stale audit responses', async () => {
  summaries = [saved('first', 'First history'), saved('second', 'Second history')]; transcripts.second = [assistant('Second retained answer')];
  const pendingRead = deferred(); globalThis.__chatRead = id => id === 'first' ? pendingRead.promise : Promise.resolve({data: {messages: transcripts[id]}, error: null});
  await show(); await open('First history'); await open('Second history');
  await act(async () => pendingRead.resolve({data: {messages: [assistant('Stale first answer')]}, error: null}));
  assert.ok(screen.getByText('Second retained answer')); assert.equal(screen.queryByText('Stale first answer'), null);
  const pendingAudit = deferred(); transcripts.first = [assistant('Pending audit answer')]; globalThis.__chatRead = async id => ({data: {messages: transcripts[id]}, error: null});
  globalThis.__chatAudit = params => params.p_session_id === 'first' ? pendingAudit.promise : Promise.resolve({data: [], error: null});
  await open('First history'); await open('Second history'); await act(async () => pendingAudit.resolve({data: [], error: null}));
  assert.ok(screen.getByText('Second retained answer')); assert.equal(screen.queryByText('Pending audit answer'), null);
});

test('stale failed reads cannot replace a newer conversation', async () => {
  summaries = [saved('first', 'First history'), saved('second', 'Second history')]; transcripts.second = [assistant('Current history')]; const pending = deferred();
  globalThis.__chatRead = id => id === 'first' ? pending.promise : Promise.resolve({data: {messages: transcripts[id]}, error: null});
  await show(); await open('First history'); await open('Second history'); await act(async () => pending.reject(new Error('Old failure')));
  assert.ok(screen.getByText('Current history')); assert.equal(screen.queryByText(/Unable to load this conversation/), null);
});

test('deleting a selected chat uses user module and id filters and creates a new session', async () => {
  summaries = [saved('selected', 'Selected history'), saved('other', 'Other history')]; transcripts.selected = [assistant('Selected answer')];
  await show({moduleId: 'http2-compliance-study'}); await open('Selected history');
  await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Delete chat: Selected history'})));
  assert.equal(screen.queryByText('Selected answer'), null); assert.equal(screen.queryByRole('button', {name: /^Selected history/}), null); assert.ok(screen.getByRole('button', {name: /^Other history/}));
  assert.deepEqual(queries.at(-1).filters, [['id', 'selected'], ['user_id', 'fixture@example.test'], ['module_id', 'http2-compliance-study']]);
  await send('New session question'); assert.notEqual(sends.at(-1)[1], 'selected');
});

test('deleting another chat preserves the current conversation and a rejected delete retains its history', async () => {
  summaries = [saved('selected', 'Selected history'), saved('other', 'Other history')]; transcripts.selected = [assistant('Keep selected answer')];
  await show(); await open('Selected history'); globalThis.__chatDelete = async () => ({error: {message: 'rejected'}});
  await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Delete chat: Other history'})));
  assert.ok(screen.getByRole('alert')); assert.ok(screen.getByRole('button', {name: 'Delete chat: Other history'}));
  globalThis.__chatDelete = async () => ({error: null}); await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Delete chat: Other history'})));
  assert.ok(screen.getByText('Keep selected answer')); assert.equal(screen.queryByRole('button', {name: 'Delete chat: Other history'}), null);
});

test('late deletion of a previously selected conversation does not clear a new one', async () => {
  summaries = [saved('old', 'Old history'), saved('new', 'New history')]; transcripts.old = [assistant('Old answer')]; transcripts.new = [assistant('New selected answer')];
  const pending = deferred(); globalThis.__chatDelete = () => pending.promise;
  await show(); await open('Old history'); await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Delete chat: Old history'}))); await open('New history');
  await act(async () => pending.resolve({error: null})); assert.ok(screen.getByText('New selected answer'));
});

test('history summaries skip tool results and handle missing content and bounded previews', async () => {
  summaries = [saved('long', 'x'.repeat(51)), saved('empty', '', {messages: null}), saved('tool', '', {messages: [{role: 'user', content: [{toolResult: {}}]}]}), saved('mixed', '', {messages: [null, {role: 'user', content: ['String ', {text: 'and block'}, {}]}]})];
  await show(); assert.ok(screen.getByRole('button', {name: new RegExp('^' + 'x'.repeat(50) + '\\.\\.\\.')})); assert.equal(screen.getAllByRole('button', {name: /^Empty chat/}).length, 2);
  assert.ok(screen.getByRole('button', {name: /^String and block/}));
});

test('history failures remain visible and an unmounted pending history read changes no UI', async () => {
  globalThis.__chatList = async () => ({data: null, error: {message: 'rejected'}}); const first = await show(); assert.ok(screen.getByRole('alert')); first.unmount();
  const pending = deferred(); globalThis.__chatList = () => pending.promise; const view = await show(); view.unmount();
  await act(async () => pending.resolve({data: [saved('late', 'Late history')], error: null})); assert.equal(screen.queryByText('Late history'), null);
});

test('an absent caller identity never becomes an unfiltered delete and raw assistant HTML is inert', async () => {
  summaries = [saved('unowned', 'Unowned fixture')]; globalThis.__chatDelete = async () => ({error: {message: 'not authenticated'}});
  await show({userEmail: undefined}); await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Delete chat: Unowned fixture'})));
  assert.deepEqual(queries.at(-1).filters, [['id', 'unowned'], ['user_id', ''], ['module_id', 'congestion-control-emulated']]); assert.ok(screen.getByRole('alert'));
  globalThis.__chatSend = async () => ({response: '<script>window.__unsafe = true</script>\n\n[Evidence](https://example.test/source)'});
  await send('Question'); assert.equal(document.querySelector('script'), null); assert.equal(window.__unsafe, undefined); assert.equal(screen.getByRole('link', {name: 'Evidence'}).getAttribute('href'), 'https://example.test/source');
});
