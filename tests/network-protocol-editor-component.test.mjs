import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

globalThis.__networkEditorReact = React;
const replacements = {
  '@/lib/research-workflow-api': 'export const researchRequest=(...args)=>globalThis.__networkEditorState.request(...args);',
  '@/lib/real-world-api': 'export const realWorldRequest=(...args)=>globalThis.__networkEditorState.regions(...args);',
  '@/app/components/research-workflow/select': `export function ResearchSelect({label,value,onChange,options}){const R=globalThis.__networkEditorReact;return R.createElement('label',null,label,R.createElement('select',{'aria-label':label,value,onChange:e=>onChange(e.target.value)},options.map(o=>R.createElement('option',{key:o.value,value:o.value},o.label))));}`,
  '@/app/components/real-world-placement': `export function RealWorldPlacement(props){globalThis.__networkEditorState.placements[props.label]=props;return globalThis.__networkEditorReact.createElement('div',{'data-placement':props.label},props.label);}`,
};
const hook = registerHooks({resolve(specifier, context, next) {
  // NetworkingFields uses a relative import of the same shared select.
  if (specifier === './select' && context.parentURL?.endsWith('/networking-fields.tsx')) specifier = '@/app/components/research-workflow/select';
  return Object.hasOwn(replacements, specifier) ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);
}});
const {NetworkProtocolEditor} = await import('../app/components/research-ideas/network-protocol-editor.tsx');
const {NetworkingFields, NetworkingMetricFields} = await import('../app/components/research-workflow/networking-fields.tsx');
const {NETWORK_RUNNERS} = await import('../lib/network-execution.ts');
hook.deregister();

let state;
const plan = {question: 'Does configured delay affect completion?', hypothesis: 'Delay increases completion time.', controls: 'Same payload', limitations: 'One host'};
const configLabel = 'Networking test configuration JSON';
const applyButton = () => screen.getByRole('button', {name: 'Apply executable configuration to candidate'});
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), {target: {value: String(value)}});
const choose = runner => change('Networking executor', runner);
const configuration = () => JSON.parse(screen.getByLabelText(configLabel).value);
const capabilities = () => ({networking: {version: 'network-execution-v1', runners: NETWORK_RUNNERS.map(r => ({...r, enabled: true})), max_jobs: 32}});
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
beforeEach(() => {
  state = {calls: [], changes: [], edits: 0, placements: {}, regionCalls: [],
    handle: async path => path === '/capabilities' ? capabilities() : {document: {compiled: true}},
    regions: async path => {state.regionCalls.push(path); return {regions: [{region: 'us-east-1', name: 'US East'}]};},
    request: async (path, options) => {state.calls.push({path, options}); return state.handle(path, options);},
  };
  globalThis.__networkEditorState = state;
});
afterEach(cleanup);
function show(props = {}) {
  return render(React.createElement(NetworkProtocolEditor, {studyId: 'synthetic-study', document: plan, protocol: '{}',
    onChange: text => state.changes.push(JSON.parse(text)), onEditing: () => state.edits++, ...props}));
}
const ready = () => waitFor(() => assert.equal(applyButton().disabled, false));

test('an executable candidate preserves original configuration text, declared metrics and every limit', async () => {
  show(); await ready();
  change('Configuration identity', 'recorded-config');
  const original = '{\n "num_clients":1, "client_delays_ms":[0], "zero":0\n}';
  change(configLabel, original); change('Recorded metrics and units JSON', '[{"name":"completion","units":"ms"}]');
  for (const [label, value] of [['Replications per configuration', 3], ['Execution wall limit (seconds)', 240], ['Maximum instances per invocation', 2], ['Maximum output bytes', 4096], ['Network byte threshold (custom host sampling)', 8192]]) change(label, value);
  fireEvent.click(applyButton());
  await screen.findByText('Configuration and input hashes added. Save the new plan version for review.');
  const request = state.calls.at(-1);
  assert.equal(request.path, '/studies/synthetic-study/network'); assert.equal(request.options.method, 'POST');
  const body = JSON.parse(request.options.body);
  assert.equal(body.action, 'compile'); assert.equal(body.original_configuration, original); assert.equal(body.configuration_identity, 'recorded-config');
  assert.deepEqual(body.document.configurations, [{identity: 'recorded-config', details: {test_config: JSON.parse(original)}}]);
  assert.deepEqual(body.document.metrics, [{name: 'completion', units: 'ms'}]);
  assert.deepEqual(body.document.execution.limits, {wall_seconds: 240, max_instances: 2, max_output_bytes: 4096, max_network_bytes: 8192});
  assert.equal(body.document.planned_units, 3); assert.equal(state.edits, 8);
  assert.deepEqual(state.changes, [{compiled: true}]);
});

test('saved execution restores its exact runner, identity, metrics, replications and limits', async () => {
  const saved = {execution: {runner: 'bounded-tcp-v1', replications: 4, limits: {wall_seconds: 120, max_instances: 1, max_output_bytes: 12000, max_network_bytes: 24000}}, configurations: [{identity: 'saved', details: {test_config: {payload_bytes: 8, exchanges: 2, application_delay_ms: 0}}}], metrics: [{name: 'bytes', units: 'bytes'}]};
  show({protocol: JSON.stringify(saved)}); await ready();
  assert.equal(screen.getByLabelText('Networking executor').value, 'bounded-tcp-v1');
  assert.equal(screen.getByLabelText('Configuration identity').value, 'saved');
  assert.equal(screen.getByLabelText('Replications per configuration').value, '4');
  assert.equal(screen.getByLabelText('Maximum output bytes').value, '12000');
  assert.equal(configuration().payload_bytes, 8);
  assert.deepEqual(JSON.parse(screen.getByLabelText('Recorded metrics and units JSON').value), saved.metrics);
});

test('malformed and incomplete saved execution starts with explicit emulated defaults', async () => {
  for (const protocol of ['{', '{}', JSON.stringify({execution: {runner: 'unknown'}}), JSON.stringify({execution: {runner: 'emulated-netem-v1'}, configurations: [{identity: 42}]}), JSON.stringify({execution: {runner: 'emulated-netem-v1'}, configurations: [{identity: 'missing-config', details: {}}]})]) {
    show({protocol}); await ready();
    assert.equal(configuration().num_clients, 1); assert.equal(screen.getByLabelText('Configuration identity').value, 'configuration-1');
    cleanup();
  }
});

test('changing executors resets their declared metrics and topology with bounded TCP limits', async () => {
  show({guided: true, assessment: true}); await ready();
  assert.equal(screen.getByText('Automatic networking execution').parentElement.open, true);
  assert.ok(screen.getByLabelText('Networking assessment configuration JSON'));
  for (const runner of NETWORK_RUNNERS) {
    choose(runner.id);
    const config = JSON.parse(screen.getByLabelText('Networking assessment configuration JSON').value);
    assert.deepEqual(JSON.parse(screen.getByLabelText('Recorded metrics and units JSON').value), runner.units);
    if (runner.id === 'real-world-iperf-v1') {assert.equal(config.receivers.length, 1); assert.equal(screen.getByLabelText('Maximum instances per invocation').value, '3');}
    if (runner.id === 'emulated-netem-v1') assert.equal(config.client_ccas[0], 'cubic');
    if (runner.id === 'custom-package-v1') assert.deepEqual(config.package, {});
    if (runner.id === 'bounded-tcp-v1') {assert.equal(config.payload_bytes, 32); assert.equal(screen.getByLabelText('Execution wall limit (seconds)').value, '60'); assert.equal(screen.getByLabelText('Maximum output bytes').value, '32000');}
  }
});

test('capability absence and retrieval errors remain explicit and disable compilation', async () => {
  for (const failure of [new Error('Synthetic capability failure'), 'unstructured']) {
    state.handle = async () => {throw failure;}; show();
    await screen.findByText(failure instanceof Error ? failure.message : 'Executor availability is unknown.');
    assert.equal(applyButton().disabled, true); cleanup();
  }
  state.handle = async () => ({}); show();
  await act(async () => {});
  assert.equal(applyButton().disabled, true); cleanup();
  state.handle = async () => ({networking: {...capabilities().networking, runners: []}}); show();
  await screen.findByText('This runner is registered but cloud execution is not enabled in the connected environment.');
});

test('unmount aborts capability reads and ignores late success or rejection', async () => {
  for (const succeeds of [true, false]) {
    const pending = deferred(); state.handle = () => pending.promise;
    const view = show(); const signal = state.calls.at(-1).options.signal; view.unmount();
    assert.equal(signal.aborted, true);
    await act(async () => {if (succeeds) pending.resolve(capabilities()); else pending.reject(new Error('Late original failure'));});
    assert.deepEqual(state.changes, []);
  }
});

test('compilation errors retain the editable candidate and never report an unconfirmed save', async () => {
  show(); await ready();
  for (const invalid of ['{', '[]']) {
    change(configLabel, invalid); fireEvent.click(applyButton());
    await waitFor(() => assert.ok(screen.getAllByRole('status').length));
    assert.equal(state.calls.filter(c => c.path.endsWith('/network')).length, 0);
    assert.deepEqual(state.changes, []);
  }
  change(configLabel, '{}');
  for (const failure of [new Error('Synthetic compile rejected'), 'unstructured']) {
    state.handle = async () => {throw failure;}; fireEvent.click(applyButton());
    await screen.findByText(failure instanceof Error ? failure.message : 'Configuration compilation failed.');
    assert.equal(applyButton().disabled, false); assert.deepEqual(state.changes, []);
  }
});

test('package upload preserves source and version, attaches the retained identity and locks edits while pending', async () => {
  show(); await ready(); choose('custom-package-v1');
  const source = '# original\nprint("synthetic")\n';
  change('Original Python experiment source', source); change('Package version', 'source-v2');
  const pending = deferred(); state.handle = () => pending.promise;
  fireEvent.click(screen.getByRole('button', {name: 'Preserve package source'}));
  assert.equal(screen.getByLabelText(configLabel).disabled, true);
  choose('bounded-tcp-v1');
  assert.equal(screen.getByLabelText('Networking executor').value, 'custom-package-v1');
  const body = JSON.parse(state.calls.at(-1).options.body);
  assert.deepEqual({...body, request_id: undefined}, {action: 'upload-package', request_id: undefined, source, version: 'source-v2'});
  assert.match(body.request_id, /^[a-f0-9-]{36}$/);
  await act(async () => pending.resolve({artifact_id: 'original-package', sha256: 'a'.repeat(64)}));
  await screen.findByText('Package source saved privately with its SHA256.');
  assert.deepEqual(configuration().package, {artifact_id: 'original-package', sha256: 'a'.repeat(64)});
});

test('package upload failures retain the original source for a deliberate retry', async () => {
  show(); await ready(); choose('custom-package-v1'); change('Original Python experiment source', 'original source');
  for (const failure of [new Error('Synthetic upload unconfirmed'), 'unstructured']) {
    state.handle = async () => {throw failure;}; fireEvent.click(screen.getByRole('button', {name: 'Preserve package source'}));
    await screen.findByText(failure instanceof Error ? failure.message : 'Package persistence was not confirmed.');
    assert.equal(screen.getByLabelText('Original Python experiment source').value, 'original source');
    assert.deepEqual(configuration().package, {});
  }
});

test('private input uploads preserve UTF-8 bytes and add only artifact references to the configuration', async () => {
  show(); await ready(); choose('custom-package-v1');
  change(configLabel, JSON.stringify({...configuration(), private_inputs: {'previous.json': {artifact_id: 'previous'}}}));
  change('Private input filename', 'provider.json'); change('Private input version', 'input-v2');
  const original = '  {"region":"Ω 東京","zero":0}\n'; change('Original private input text', original);
  state.handle = async () => ({artifact_id: 'private-original', sha256: 'b'.repeat(64)});
  fireEvent.click(screen.getByRole('button', {name: 'Preserve private experiment input'}));
  await screen.findByText(/Original input retained privately/);
  const body = JSON.parse(state.calls.at(-1).options.body);
  assert.equal(body.action, 'upload-input'); assert.equal(body.version, 'input-v2');
  assert.equal(Buffer.from(body.original_base64, 'base64').toString('utf8'), original);
  assert.deepEqual(configuration().private_inputs, {'previous.json': {artifact_id: 'previous'}, 'provider.json': {artifact_id: 'private-original', sha256: 'b'.repeat(64)}});
  assert.equal(screen.getByLabelText('Original private input text').value, '');
  assert.equal(state.changes.length, 0);
  change(configLabel, JSON.stringify({mode: 'real-world', package: {}}));
  change('Original private input text', 'x'.repeat(24000));
  fireEvent.click(screen.getByRole('button', {name: 'Preserve private experiment input'}));
  await waitFor(() => assert.equal(screen.getByLabelText('Original private input text').value, ''));
  assert.deepEqual(Object.keys(configuration().private_inputs), ['provider.json']);
});

test('private input bounds use bytes and unconfirmed uploads retain the input without adding a reference', async () => {
  show(); await ready(); choose('custom-package-v1'); change('Original private input text', '東'.repeat(8001));
  fireEvent.click(screen.getByRole('button', {name: 'Preserve private experiment input'}));
  await screen.findByText(/Use up to 24 KB/); assert.equal(state.calls.length, 1);
  change('Original private input text', 'original private input');
  for (const failure of [new Error('Synthetic input unconfirmed'), 'unstructured']) {
    state.handle = async () => {throw failure;}; fireEvent.click(screen.getByRole('button', {name: 'Preserve private experiment input'}));
    await screen.findByText(failure instanceof Error ? failure.message : 'Private input persistence was not confirmed.');
    assert.equal(configuration().private_inputs, undefined);
    assert.equal(screen.getByLabelText('Original private input text').value, 'original private input');
  }
});

test('guided parameter validation blocks compilation until corrected and preserves unrelated configuration', async () => {
  show({guided: true}); await ready(); choose('custom-package-v1');
  change('Experiment parameters JSON', '[]');
  assert.equal(applyButton().disabled, true); assert.match(screen.getByRole('alert').textContent, /valid JSON object/);
  change('Experiment parameters JSON', '{"zero":0,"missing":null}');
  assert.equal(applyButton().disabled, false); assert.equal(configuration().mode, 'real-world');
  assert.deepEqual(configuration().parameters, {zero: 0, missing: null});
  change('Custom experiment environment', 'emulated'); assert.equal(configuration().mode, 'emulated');
  change('Metric name 1', 'latency'); change('Metric units 1', 'ms');
  assert.deepEqual(JSON.parse(screen.getByLabelText('Recorded metrics and units JSON').value), [{name: 'latency', units: 'ms'}]);
});

function fields(runner, initial, options = {}) {
  state.values = initial; state.validity = [];
  function Harness() {
    const [value, setValue] = React.useState(initial);
    return React.createElement(NetworkingFields, {runner, text: typeof value === 'string' ? value : JSON.stringify(value), disabled: false,
      onChange(update) {setValue(previous => {state.values = update(previous); return state.values;});},
      onValidityChange(valid) {state.validity.push(valid);}, ...options});
  }
  return render(React.createElement(Harness));
}

test('invalid field and metric documents explain the required correction', () => {
  for (const text of ['{', 'null', '[]', 'false']) {
    fields('bounded-tcp-v1', text); assert.ok(screen.getByText(/configuration needs valid fields/)); cleanup();
  }
  for (const text of ['{', '{}', '[null]', '[false]']) {
    render(React.createElement(NetworkingMetricFields, {text, disabled: false, onChange() {assert.fail('Invalid declarations must not emit edits');}}));
    assert.ok(screen.getByText(/Correct the metric declarations/)); cleanup();
  }
});

test('bounded TCP field changes retain zero and missing numeric input explicitly', () => {
  fields('bounded-tcp-v1', {payload_bytes: 8, exchanges: 2, application_delay_ms: 1});
  change('Application delay per exchange (ms)', 0); change('Payload per exchange (bytes)', '');
  assert.deepEqual(state.values, {payload_bytes: null, exchanges: 2, application_delay_ms: 0});
});

test('emulated client count preserves existing arrays and initializes each newly added client', () => {
  fields('emulated-netem-v1', {num_clients: 1, client_delays_ms: [0], client_ccas: ['bbr'], client_file_sizes_mbytes: [2], client_start_delays_ms: [0]});
  for (const invalid of [0, 11, 1.5, '']) change('Number of clients', invalid);
  assert.equal(state.values.num_clients, 1);
  change('Number of clients', 2);
  assert.deepEqual(state.values.client_delays_ms, [0, 10]); assert.deepEqual(state.values.client_ccas, ['bbr', 'cubic']);
  assert.deepEqual(state.values.client_file_sizes_mbytes, [2, 1]); assert.deepEqual(state.values.client_start_delays_ms, [0, 0]);
  change('Client 2 congestion control', 'reno'); change('Client 2 configured delay (ms)', 50); change('Client 1 file size (mb)', '');
  assert.deepEqual(state.values.client_ccas, ['bbr', 'reno']); assert.deepEqual(state.values.client_delays_ms, [0, 50]);
  assert.deepEqual(state.values.client_file_sizes_mbytes, [null, 1]);
  change('Number of clients', 1); assert.deepEqual(state.values.client_ccas, ['bbr']);
});

test('incomplete emulated arrays get defaults without inventing start-delay fields', () => {
  for (const num_clients of [undefined, 1.5]) {
    fields('emulated-netem-v1', {num_clients});
    assert.equal(screen.getByLabelText('Number of clients').value, '1');
    change('Number of clients', 2);
    assert.deepEqual(state.values.client_ccas, ['cubic', 'cubic']);
    assert.deepEqual(state.values.client_delays_ms, [10, 10]);
    assert.equal(state.values.client_start_delays_ms, undefined);
    cleanup();
  }
});

test('disabled field callbacks cannot change congestion control or custom execution mode', () => {
  for (const [runner, initial, label, next] of [
    ['emulated-netem-v1', {num_clients: 1, client_ccas: ['bbr']}, 'Client 1 congestion control', 'reno'],
    ['real-world-iperf-v1', {server: {}, bottleneck: {}, receivers: [], cca: 'cubic'}, 'Server congestion control', 'bbr'],
    ['custom-package-v1', {}, 'Custom experiment environment', 'emulated'],
  ]) {
    fields(runner, initial, {disabled: true});
    change(label, next);
    assert.deepEqual(state.values, initial);
    cleanup();
  }
});

test('guided placement callbacks ignore unchanged values and retain configuration when an update fails', async () => {
  show({guided: true}); await ready(); choose('real-world-iperf-v1');
  await waitFor(() => assert.equal(state.placements.Server.disabled, false));
  const original = screen.getByLabelText(configLabel).value;
  const edits = state.edits;
  await act(async () => state.placements.Server.onChange(previous => previous));
  assert.equal(state.edits, edits);
  await act(async () => state.placements.Server.onChange(() => {throw new Error('Synthetic placement update rejected');}));
  await screen.findByText('Correct the full configuration JSON before using these controls.');
  assert.equal(screen.getByLabelText(configLabel).value, original);
});

test('saved multiple-bottleneck topologies remain in the full editor', () => {
  fields('emulated-netem-v1', {script: 'netem_multi_bottleneck.py'});
  assert.ok(screen.getByText(/Preserve its topology/)); assert.equal(screen.queryByLabelText('Number of clients'), null);
});

test('real-world fields synchronize placements and add or remove independent receivers', async () => {
  const placement = {region: 'us-east-1', zone_id: 'use1-az1', instance_type: 't3.medium'};
  fields('real-world-iperf-v1', {server: placement, bottleneck: placement, receivers: [placement], cca: 'cubic'});
  await waitFor(() => assert.equal(state.placements.Server.disabled, false));
  assert.deepEqual(state.regionCalls, ['/regions']);
  change('Server congestion control', 'bbr'); assert.equal(state.values.cca, 'bbr');
  await act(async () => state.placements.Server.onChange(previous => ({...previous, instance_type: 't3.large'})));
  assert.equal(state.values.server.instance_type, 't3.large'); assert.equal(state.values.bottleneck.instance_type, 't3.medium');
  await act(async () => state.placements['Receiver 1'].onChange(previous => ({...previous, region: 'us-west-2'})));
  assert.equal(state.values.receivers[0].region, 'us-west-2');
  fireEvent.click(screen.getByRole('button', {name: 'Add receiver'}));
  assert.equal(state.values.receivers.length, 2); assert.ok(state.placements['Receiver 2']);
  fireEvent.click(screen.getByRole('button', {name: 'Remove last receiver'}));
  assert.equal(state.values.receivers.length, 1); assert.equal(screen.getByRole('button', {name: 'Remove last receiver'}).disabled, true);
});

test('real-world topology errors, region errors and late replies do not invent placement availability', async () => {
  fields('real-world-iperf-v1', {}); assert.ok(screen.getByText(/Correct the saved topology/)); cleanup();
  const topology = {server: {}, bottleneck: {}, receivers: [], cca: 'cubic'};
  for (const failure of [new Error('Synthetic region failure'), 'unstructured']) {
    state.regions = async () => {throw failure;}; fields('real-world-iperf-v1', topology);
    await screen.findByRole('alert'); assert.match(screen.getByRole('alert').textContent, failure instanceof Error ? /Synthetic region failure/ : /Region availability could not be loaded/);
    assert.equal(state.placements.Server.disabled, true); cleanup();
  }
  for (const succeeds of [true, false]) {
    const pending = deferred(); state.regions = () => pending.promise; const view = fields('real-world-iperf-v1', topology); view.unmount();
    await act(async () => {if (succeeds) pending.resolve({regions: []}); else pending.reject(new Error('Late failure'));});
    assert.equal(screen.queryByRole('alert'), null);
  }
});

test('metric controls preserve unrelated rows, distinguish missing counts from zero and enforce row bounds', () => {
  let values = [{name: 'first', units: 'ms', planned_observations: 2}, {name: 'second', units: 'bytes'}];
  function Harness() {
    const [metrics, setMetrics] = React.useState(values);
    return React.createElement(NetworkingMetricFields, {text: JSON.stringify(metrics), disabled: false, onChange(text) {values = JSON.parse(text); setMetrics(values);}});
  }
  render(React.createElement(Harness));
  change('Expected records per invocation 1', ''); assert.equal('planned_observations' in values[0], false);
  change('Expected records per invocation 1', 3); assert.equal(values[0].planned_observations, 3);
  assert.deepEqual(values[1], {name: 'second', units: 'bytes'});
  fireEvent.click(screen.getByRole('button', {name: 'Remove metric 1'}));
  assert.deepEqual(values, [{name: 'second', units: 'bytes'}]);
  assert.equal(screen.getByRole('button', {name: 'Remove metric 1'}).disabled, true);
  for (let i = 1; i < 20; i++) fireEvent.click(screen.getByRole('button', {name: 'Add another metric'}));
  assert.equal(values.length, 20); assert.equal(screen.getByRole('button', {name: 'Add another metric'}).disabled, true);
});
