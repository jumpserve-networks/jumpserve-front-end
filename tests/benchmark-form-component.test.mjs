import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

const api = new URL('../lib/benchmark-api.ts', import.meta.url).href;
const button = new URL('../app/components/ui/button.tsx', import.meta.url).href;
globalThis.__benchmarkReact=React;
const replacements = {
  'next/navigation': `export const useRouter=()=>({push:(...args)=>globalThis.__benchmarkPush(...args)});`,
  '@/lib/browser-auth': `export const requireAccessToken=()=>globalThis.__benchmarkToken();`,
  '@/lib/supabase/client': `export const createClient=()=>globalThis.__benchmarkDatabase;`,
  '@/lib/benchmark-api': `export {defaultConfig,AVAILABLE_CCAS,AVAILABLE_SCRIPTS,AVAILABLE_TOPOLOGIES,validateMultiBottleneckConfig} from ${JSON.stringify(api)};export const launchBenchmark=(...args)=>globalThis.__benchmarkLaunch(...args);`,
  '@/app/components/ui/button':`import {Button as Original} from ${JSON.stringify(button)};export function Button(props){globalThis.__benchmarkActions.set(props.children,props);return globalThis.__benchmarkReact.createElement(Original,props);}`,
};
const hook = registerHooks({resolve(specifier, context, next) {
  return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);
}});
const {BenchmarkForm} = await import('../app/components/benchmark-form.tsx');
const {defaultConfig} = await import(api);
hook.deregister();
let reads, inserts, deletes, launches, navigations;
beforeEach(() => {
  reads = []; inserts = []; deletes = []; launches = []; navigations = [];
  globalThis.__benchmarkActions=new Map();
  globalThis.__benchmarkRead = async () => ({data: []}); globalThis.__benchmarkInsert = async () => ({error: null}); globalThis.__benchmarkDelete = async () => ({error: null});
  globalThis.__benchmarkDatabase = {from(table) {
    assert.equal(table, 'benchmark_configs');
    return {select(columns) {assert.equal(columns, 'id, name, description, config'); return {order(column, options) {
      assert.equal(column, 'created_at'); assert.deepEqual(options, {ascending: false}); reads.push({columns}); return globalThis.__benchmarkRead();
    }};}, insert(value) {inserts.push(value); return globalThis.__benchmarkInsert(value);}, delete() {return {eq(column, value) {
      assert.equal(column, 'id'); deletes.push(value); return globalThis.__benchmarkDelete(value);
    }};}};
  }};
  globalThis.__benchmarkToken = async () => 'synthetic-access-token';
  globalThis.__benchmarkLaunch = async (config, token) => {launches.push({config, token}); return {jobId: 'fixture-job'};};
  globalThis.__benchmarkPush = value => navigations.push(value);
});
afterEach(async () => {await act(async () => {}); cleanup(); for (const name of ['Read', 'Insert', 'Delete', 'Database', 'Token', 'Launch', 'Push']) delete globalThis['__benchmark' + name];});
async function show() {let view; await act(async () => {view = render(React.createElement(BenchmarkForm));}); return view;}
const change = (name, value) => fireEvent.change(screen.getByRole('textbox', {name}), {target: {value}});
const launch = () => fireEvent.click(screen.getByRole('button', {name: 'Run Benchmark'}));

test('disabled action callbacks reject empty identities and duplicate pending launches at the parent boundary',async()=>{
 globalThis.__benchmarkRead=async()=>({data:[{id:'saved',name:'Original saved config',config:defaultConfig()}]});await show();await act(async()=>{await globalThis.__benchmarkActions.get('Save Config').onClick();await globalThis.__benchmarkActions.get('Delete').onClick();});assert.equal(inserts.length,0);assert.equal(deletes.length,0);
 let resolve,calls=0;globalThis.__benchmarkLaunch=()=>{calls++;return new Promise(done=>{resolve=done;});};
 const action=globalThis.__benchmarkActions.get('Run Benchmark').onClick;let pending;await act(async()=>{pending=action();});await waitFor(()=>assert.equal(calls,1));await act(async()=>{await action();});assert.equal(calls,1);await act(async()=>{resolve({jobId:'original-only-job'});await pending;});
});

test('cleared numeric controls restore explicit defaults while retaining valid zero buffers',async()=>{
 await show();for(const label of ['Number of Clients','Bottleneck Rate (Mbit/s)','Buffer Size (KB)'])fireEvent.change(screen.getByRole('spinbutton',{name:label}),{target:{value:''}});
 launch();await waitFor(()=>assert.equal(launches.length,1));assert.equal(launches[0].config.num_clients,2);assert.equal(launches[0].config.bottleneck_all_client_rate_mbit,100);assert.equal(launches[0].config.bottleneck_buffer_kbytes,125);
});
async function choose(label, option) {
  fireEvent.click(screen.getByRole('combobox', {name: label}));
  const item = await screen.findByRole('option', {name: option, exact: true});
  fireEvent.pointerDown(item, {pointerType: 'mouse', button: 0});
  fireEvent.click(item);
  await waitFor(() => assert.equal(screen.queryByRole('option', {name: option, exact: true}), null));
}

test('default launch requires a verified token, preserves configuration and uses the module detail route', async () => {
  await show(); launch(); await waitFor(() => assert.equal(navigations.length, 1));
  assert.deepEqual(launches, [{config: defaultConfig(), token: 'synthetic-access-token'}]);
  assert.deepEqual(navigations, ['/congestion-control-emulated/benchmarks/fixture-job']); assert.equal(reads.length, 1);
});

test('launch pads or truncates start delays and trims experiment metadata without changing client order', async () => {
  await show(); change('Client Delays (ms, comma-separated)', '20, 0,'); change('Client File Sizes (MB, comma-separated)', '5, 10');
  change('Client Start Delays (ms, comma-separated)', '30'); change('Client CCAs (comma-separated)', ' BBR , CUBIC ');
  change('Experiment Name', ' Fixture campaign '); change('Tags (comma-separated)', ' first, , second '); change('Notes', ' Exact settings ');
  await act(async () => launch()); await waitFor(() => assert.equal(launches.length, 1));
  assert.deepEqual(launches[0].config.client_start_delays_ms, [30, 0]); assert.deepEqual(launches[0].config.client_ccas, ['bbr', 'cubic']);
  assert.equal(launches[0].config.experiment_name, 'Fixture campaign'); assert.deepEqual(launches[0].config.tags, ['first', 'second']); assert.equal(launches[0].config.notes, 'Exact settings');
});

test('invalid client array lengths stop before authentication or dispatch', async () => {
  await show(); let tokens = 0; globalThis.__benchmarkToken = async () => {tokens++; return 'synthetic-token';};
  for (const [field, value, expected] of [['Client Delays (ms, comma-separated)', '10', 'Expected 2 delay values, got 1'],
    ['Client CCAs (comma-separated)', 'cubic', 'Expected 2 CCA selections, got 1'], ['Client File Sizes (MB, comma-separated)', '10', 'Expected 2 file size values, got 1']]) {
    change(field, value); launch(); assert.ok(screen.getByText(expected)); change(field, field.includes('CCA') ? 'cubic, bbr' : '10, 10');
  }
  assert.equal(tokens, 0); assert.equal(launches.length, 0);
});

test('CCA buttons fill missing clients and replace the last selection while retaining earlier clients', async () => {
  await show(); change('Client CCAs (comma-separated)', 'cubic'); fireEvent.click(screen.getByRole('button', {name: 'bbr3', exact: true}));
  assert.equal(screen.getByRole('textbox', {name: 'Client CCAs (comma-separated)'}).value, 'cubic, bbr3');
  fireEvent.click(screen.getByRole('button', {name: 'reno', exact: true})); launch(); await waitFor(() => assert.equal(launches.length, 1));
  assert.deepEqual(launches[0].config.client_ccas, ['cubic', 'reno']);
});

test('pending launches are not duplicated and job identities are URL encoded', async () => {
  let resolve; let calls = 0; globalThis.__benchmarkLaunch = () => {calls++; return new Promise(done => {resolve = done;});};
  await show(); launch(); await waitFor(() => assert.equal(calls, 1));
  const pending = screen.getByRole('button', {name: 'Launching...'}); assert.equal(pending.disabled, true); fireEvent.click(pending); assert.equal(calls, 1);
  await act(async () => resolve({jobId: 'job/with space'})); assert.equal(navigations[0], '/congestion-control-emulated/benchmarks/job%2Fwith%20space');
});

test('authentication and launch failures stay visible and permit a deliberate retry', async () => {
  await show(); globalThis.__benchmarkToken = async () => {throw new Error('Sign in required');}; launch();
  await screen.findByText('Sign in required'); assert.equal(launches.length, 0);
  globalThis.__benchmarkToken = async () => 'synthetic-token'; globalThis.__benchmarkLaunch = async () => {throw null;}; launch();
  await screen.findByText('Failed to launch benchmark. Please try again.');
  globalThis.__benchmarkLaunch = async () => ({jobId: 'retry-job'}); launch();
  await waitFor(() => assert.equal(navigations[0], '/congestion-control-emulated/benchmarks/retry-job'));
});

test('saving trims names and optional descriptions, refreshes the catalogue and retains the exact config', async () => {
  await show(); assert.equal(screen.getByRole('button', {name: 'Save Config'}).disabled, true);
  change('Config name', ' Fixture saved config '); change('Config description', ' Declared experiment ');
  fireEvent.click(screen.getByRole('button', {name: 'Save Config'})); await screen.findByText('Config saved!');
  assert.deepEqual(inserts, [{name: 'Fixture saved config', description: 'Declared experiment', config: defaultConfig()}]);
  assert.equal(screen.getByRole('textbox', {name: 'Config name'}).value, ''); assert.equal(reads.length, 2);
  change('Config name', 'Second'); fireEvent.click(screen.getByRole('button', {name: 'Save Config'})); await waitFor(() => assert.equal(inserts.length, 2));
  assert.equal(Object.hasOwn(inserts[1], 'description'), false);
});

test('save failures preserve the draft and an invalid configuration is never persisted', async () => {
  globalThis.__benchmarkInsert = async () => ({error: {message: 'Synthetic write rejected'}});
  await show(); change('Config name', 'Retained draft'); fireEvent.click(screen.getByRole('button', {name: 'Save Config'}));
  await screen.findByText('Failed to save: Synthetic write rejected'); assert.equal(screen.getByRole('textbox', {name: 'Config name'}).value, 'Retained draft');
  change('Client Delays (ms, comma-separated)', '10'); fireEvent.click(screen.getByRole('button', {name: 'Save Config'}));
  assert.equal(inserts.length, 1); assert.ok(screen.getByText('Expected 2 delay values, got 1'));
});

test('saved configurations restore parameters and metadata and deletion is scoped to the selected ID', async () => {
  const config = {...defaultConfig(), num_clients: 3, client_delays_ms: [0, 10, 20], client_ccas: ['reno', 'bbr', 'cubic'],
    client_file_sizes_mbytes: [1, 2, 3], client_start_delays_ms: [0, 20, 40], experiment_name: 'Recorded experiment', tags: ['a', 'b'], notes: 'Retained notes'};
  const saved = [{id: 'saved-fixture', name: 'Fixture preset', description: 'Recorded description', config}];
  globalThis.__benchmarkRead = async () => ({data: saved}); await show(); await screen.findByRole('combobox', {name: 'Load Saved Config'});
  assert.equal(screen.getByRole('button', {name: 'Delete'}).disabled, true);
  await choose('Load Saved Config', 'Fixture preset — Recorded description');
  assert.equal(screen.getByRole('spinbutton', {name: 'Number of Clients'}).value, '3');
  assert.equal(screen.getByRole('textbox', {name: 'Experiment Name'}).value, 'Recorded experiment');
  assert.equal(screen.getByRole('textbox', {name: 'Tags (comma-separated)'}).value, 'a, b');
  globalThis.__benchmarkDelete = async () => ({error: {message: 'Synthetic delete denied'}});
  fireEvent.click(screen.getByRole('button', {name: 'Delete'})); await screen.findByText('Failed to delete: Synthetic delete denied');
  assert.deepEqual(deletes, ['saved-fixture']); assert.equal(screen.getByRole('button', {name: 'Delete'}).disabled, false);
  globalThis.__benchmarkDelete = async () => ({error: null}); globalThis.__benchmarkRead = async () => ({data: []});
  fireEvent.click(screen.getByRole('button', {name: 'Delete'})); await screen.findByText('Config deleted');
  assert.equal(screen.queryByRole('combobox', {name: 'Load Saved Config'}), null);
});

test('multi-bottleneck controls validate topology and exact numeric pairs before launch', async () => {
  await show(); await choose('Benchmark Script', 'Multi-Bottleneck (parking-lot / dumbbell)'); launch();
  assert.ok(screen.getByText('Choose a topology for the multi-bottleneck benchmark.'));
  await choose('Network Topology', 'Dumbbell'); change('Bottleneck Rates (Mbit/s, comma-separated)', '100,'); launch();
  assert.ok(screen.getByText('Enter two bottleneck rates between 1 and 10,000 Mbit/s.'));
  change('Bottleneck Rates (Mbit/s, comma-separated)', '100, 50'); change('Client Group Sizes (comma-separated)', '2, 2'); launch();
  assert.ok(screen.getByText('Enter two positive client group sizes that add up to the number of clients.'));
  change('Client Group Sizes (comma-separated)', '1, 1'); change('Buffer Sizes (KB, comma-separated)', '0, 125'); launch();
  await waitFor(() => assert.equal(launches.length, 1)); assert.deepEqual(launches[0].config.bottleneck_rates_mbit, [100, 50]);
  assert.deepEqual(launches[0].config.bottleneck_buffers_kbytes, [0, 125]); assert.deepEqual(launches[0].config.client_groups, [1, 1]);
});

test('switching to a standard runner removes multi-bottleneck-only settings from the submitted config', async () => {
  await show(); await choose('Benchmark Script', 'Multi-Bottleneck (parking-lot / dumbbell)'); await choose('Network Topology', 'Parking lot (experimental)');
  assert.ok(screen.getByText(/only the first bottleneck rate and buffer are applied/));
  await choose('Benchmark Script', 'Nines Benchmark'); await choose('Metrics Source', 'SS (out-of-band)');
  change('Client Start Delays (ms, comma-separated)', '1, 2, 999'); launch(); await waitFor(() => assert.equal(launches.length, 1));
  assert.equal(launches[0].config.script, 'netem_cubic_benchmark_nines.py'); assert.equal(launches[0].config.snapshot_metrics_source, 'ss');
  assert.deepEqual(launches[0].config.client_start_delays_ms, [1, 2]);
  for (const key of ['topology', 'bottleneck_rates_mbit', 'bottleneck_buffers_kbytes', 'client_groups']) assert.equal(Object.hasOwn(launches[0].config, key), false);
});

test('a valid zero buffer size is retained instead of silently replaced with the default', async () => {
  await show(); fireEvent.change(screen.getByRole('spinbutton', {name: 'Buffer Size (KB)'}), {target: {value: '0'}}); launch();
  await waitFor(() => assert.equal(launches.length, 1)); assert.equal(launches[0].config.bottleneck_buffer_kbytes, 0);
});

test('invalid numeric tokens cannot silently disappear from a configuration or become null in JSON', async () => {
  await show();
  for (const [field, value, reset] of [['Client Delays (ms, comma-separated)', '10, invalid, 60', '10, 60'],
    ['Client File Sizes (MB, comma-separated)', 'Infinity, 10', '10, 10'], ['Client Start Delays (ms, comma-separated)', 'NaN', '0, 0']]) {
    change(field, value); launch(); assert.ok(screen.getByText('Enter finite numeric delay, file size, and start delay values.'));
    await act(async () => {}); assert.equal(launches.length, 0); change(field, reset);
  }
});

test('late catalogue responses after unmount do not create controls or launch work', async () => {
  let resolve; globalThis.__benchmarkRead = () => new Promise(done => {resolve = done;});
  const {unmount} = await show(); unmount(); await act(async () => resolve({data: [{id: 'late', name: 'Late preset', config: defaultConfig()}]}));
  assert.equal(screen.queryByRole('combobox', {name: 'Load Saved Config'}), null); assert.equal(launches.length, 0);
});

test('editing the client count and rate preserves each explicitly configured client in the launch', async () => {
  await show(); fireEvent.change(screen.getByRole('spinbutton', {name: 'Number of Clients'}), {target: {value: '3'}});
  fireEvent.change(screen.getByRole('spinbutton', {name: 'Bottleneck Rate (Mbit/s)'}), {target: {value: '42.5'}});
  change('Client Delays (ms, comma-separated)', '0, 10, 20'); change('Client CCAs (comma-separated)', 'cubic, bbr, reno');
  change('Client File Sizes (MB, comma-separated)', '5, 10, 20'); launch(); await waitFor(() => assert.equal(launches.length, 1));
  assert.equal(launches[0].config.num_clients, 3); assert.equal(launches[0].config.bottleneck_all_client_rate_mbit, 42.5);
  assert.deepEqual(launches[0].config.client_start_delays_ms, [0, 0, 0]);
});

test('restoring a parking-lot configuration retains rate and buffer pairs and removes inapplicable client groups', async () => {
  const config = {...defaultConfig(), script: 'netem_multi_bottleneck.py', topology: 'parking-lot',
    bottleneck_rates_mbit: [20, 30], bottleneck_buffers_kbytes: [0, 64], client_groups: [1, 1]};
  globalThis.__benchmarkRead = async () => ({data: [{id: 'multi-fixture', name: 'Recorded parking lot', description: null, config}]});
  await show(); await screen.findByRole('combobox', {name: 'Load Saved Config'}); await choose('Load Saved Config', 'Recorded parking lot');
  assert.equal(screen.getByRole('textbox', {name: 'Bottleneck Rates (Mbit/s, comma-separated)'}).value, '20, 30');
  assert.equal(screen.getByRole('textbox', {name: 'Buffer Sizes (KB, comma-separated)'}).value, '0, 64');
  assert.equal(screen.getByRole('textbox', {name: 'Experiment Name'}).value, '');
  launch(); await waitFor(() => assert.equal(launches.length, 1));
  assert.deepEqual(launches[0].config.bottleneck_rates_mbit, [20, 30]); assert.equal(Object.hasOwn(launches[0].config, 'client_groups'), false);
});
