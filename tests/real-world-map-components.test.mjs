import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
globalThis.__mapControlReact=React;
const button=new URL('../app/components/ui/button.tsx',import.meta.url).href;
const hooks=registerHooks({resolve(specifier,context,next){return specifier==='@/app/components/ui/button'?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(`import {Button as Original} from ${JSON.stringify(button)};export function Button(props){globalThis.__mapControlActions.set(props['aria-label']??props.children,props);return globalThis.__mapControlReact.createElement(Original,props);}`)}:next(specifier,context);}});
const {AwsRegionMap}=await import('../app/components/aws-region-map.tsx');
const {RealWorldTrafficMap}=await import('../app/components/real-world-traffic-map.tsx');hooks.deregister();

const STAMP = 1794000000000;
const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
const originalResizeObserver = globalThis.ResizeObserver;
const pointerNames = ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture'];
const pointerDescriptors = Object.fromEntries(pointerNames.map(name => [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)]));
const placement = region => ({region, zone_id: region + '-zone-1', instance_type: 't3.medium'});
const region = (name, enabled = true) => ({region: name, enabled, opt_in_status: enabled ? 'opt-in-not-required' : 'not-opted-in'});
function job(changes = {}) {return {job_id: 'synthetic-map-job', status: 'running', start_epoch: (STAMP - 10000) / 1000, config: {server: placement('us-west-2'), bottleneck: placement('us-east-2'), receivers: [placement('ap-northeast-1'), placement('ap-southeast-2')], duration_seconds: 60, rate_mbit: 100, buffer_kbytes: 125, cca: 'cubic', notes: ''}, nodes: [], ...changes};}
let observed, captures, timers, changed, regionProps, mounted, trafficProps;
beforeEach(t => {
  observed = []; captures = new WeakMap(); timers = new Map(); changed = []; mounted = null;
  globalThis.__mapControlActions=new Map();
  globalThis.ResizeObserver = class ResizeObserver {constructor(callback) {this.callback = callback; this.disconnected = false; observed.push(this);} observe(target) {this.target = target;} unobserve() {} disconnect() {this.disconnected = true;}};
  for (const [name, fn] of Object.entries({setPointerCapture(id) {captures.set(this, id);}, hasPointerCapture(id) {return captures.get(this) === id;}, releasePointerCapture(id) {if (captures.get(this) === id) captures.delete(this);}})) Object.defineProperty(HTMLElement.prototype, name, {configurable: true, value: fn});
  t.mock.method(globalThis, 'setInterval', (callback, ms, ...args) => {if (ms !== 1000) return realSetInterval(callback, ms, ...args); const id = Symbol('traffic-status'); timers.set(id, callback); return id;}); t.mock.method(globalThis, 'clearInterval', id => timers.has(id) ? timers.delete(id) : realClearInterval(id)); t.mock.method(Date, 'now', () => STAMP);
  regionProps = {label: 'Server Region', regions: [region('us-west-2'), region('ap-northeast-1'), region('af-south-1', false)], value: 'us-west-2', onChange: value => changed.push(value)};
  trafficProps = {job: job(), receivedAt: STAMP, interrupted: false};
});
afterEach(() => {cleanup(); if (originalResizeObserver === undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver = originalResizeObserver; for (const name of pointerNames) {if (pointerDescriptors[name]) Object.defineProperty(HTMLElement.prototype, name, pointerDescriptors[name]); else delete HTMLElement.prototype[name];}});
const showRegion = () => {mounted = render(React.createElement(AwsRegionMap, regionProps)); return screen.getByRole('group', {name: 'Interactive Server Region'});};
const showTraffic = () => {mounted = render(React.createElement(RealWorldTrafficMap, trafficProps)); return screen.getByRole('group', {name: 'Interactive traffic map'});};
test('disabled Region callbacks refuse camera movement and marker selection at the control boundary',async()=>{
 regionProps.disabled=true;const canvas=showRegion();const initial=box(canvas);
 await act(async()=>{globalThis.__mapControlActions.get('Zoom in').onClick();globalThis.__mapControlActions.get('Select Oregon (us-west-2)').onClick({stopPropagation(){}});});
 assert.deepEqual(box(canvas),initial);assert.deepEqual(changed,[]);
});
const updateRegion = props => {Object.assign(regionProps, props); mounted.rerender(React.createElement(AwsRegionMap, regionProps));};
const updateTraffic = props => {Object.assign(trafficProps, props); mounted.rerender(React.createElement(RealWorldTrafficMap, trafficProps));};
const dimensions = canvas => {Object.defineProperties(canvas, {clientWidth: {configurable: true, value: 1000}, clientHeight: {configurable: true, value: 400}});};
const box = canvas => canvas.querySelector(':scope > svg').getAttribute('viewBox').split(' ').map(Number);
const center = canvas => {const [left, top, width, height] = box(canvas); return [left + width / 2, top + height / 2];};
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} must equal ${expected}`);
const controls = canvas => within(canvas.parentElement);
const marker = (canvas, name) => within(canvas).getAllByRole('button', {name, exact: true})[0];
const click = async element => {await act(async () => fireEvent.click(element));};
const pointer = (canvas, name, options = {}) => fireEvent[name](canvas, {pointerId: 7, isPrimary: true, button: 0, clientX: 10, clientY: 20, ...options});
async function selectMachine(name) {
  await click(screen.getByRole('combobox', {name: 'Inspect machine'}));
  await act(async () => {const option = screen.getByRole('option', {name, exact: true}); fireEvent.pointerDown(option, {pointerType: 'mouse', button: 0}); fireEvent.click(option);});
}

test('Region markers expose recorded selection and opt-in requirements without selecting unavailable Regions', async () => {
  const canvas = showRegion(); assert.equal(canvas.tabIndex, 0); assert.ok(screen.getByRole('status').textContent.includes('Oregon')); const selected = marker(canvas, 'Select Oregon (us-west-2)'); assert.equal(selected.getAttribute('aria-pressed'), 'true'); assert.ok(within(canvas).getAllByRole('button', {name: 'Select Oregon (us-west-2)'}).length > 1); const unavailable = marker(canvas, 'Cape Town (af-south-1) · requires account opt-in'); assert.equal(unavailable.getAttribute('aria-disabled'), 'true'); await click(unavailable); assert.deepEqual(changed, []);
  fireEvent.mouseEnter(selected); assert.ok(screen.getByText('Oregon · us-west-2')); fireEvent.mouseLeave(selected); assert.ok(screen.getByText('Numbered: grouped Regions. Dashed: account opt-in required.')); fireEvent.focus(unavailable); assert.ok(screen.getByText('Cape Town · af-south-1 · requires account opt-in')); fireEvent.blur(unavailable);
  await click(marker(canvas, 'Select Tokyo (ap-northeast-1)')); assert.deepEqual(changed, ['ap-northeast-1']); assert.equal(selected.getAttribute('aria-pressed'), 'true'); assert.equal(screen.getByRole('link', {name: 'Map: Natural Earth'}).getAttribute('rel'), 'noreferrer');
});

test('Region zoom is bounded and a changed dropdown selection recenters without resetting zoom', async () => {
  const canvas = showRegion(); const initial = box(canvas); const panel = controls(canvas); assert.equal(panel.getByRole('button', {name: 'Zoom out'}).disabled, true); await click(panel.getByRole('button', {name: 'Zoom in'})); close(box(canvas)[2], initial[2] / 2);
  updateRegion({value: 'ap-northeast-1'}); close(box(canvas)[2], initial[2] / 2); const tokyo = within(canvas).getByRole('button', {name: 'Select Tokyo (ap-northeast-1)'}); close(Number.parseFloat(tokyo.style.left), 50); close(Number.parseFloat(tokyo.style.top), 50);
  await click(panel.getByRole('button', {name: 'Show selected'})); close(box(canvas)[2], initial[2] / 4); for (let i = 0; i < 8; i++) await click(panel.getByRole('button', {name: 'Zoom in'})); assert.equal(panel.getByRole('button', {name: 'Zoom in'}).disabled, true); close(box(canvas)[2], initial[2] / 64); await click(panel.getByRole('button', {name: 'Zoom out'})); close(box(canvas)[2], initial[2] / 32); await click(panel.getByRole('button', {name: 'Reset world map'})); assert.deepEqual(box(canvas), initial);
});

test('Region clusters expand by zoom before selecting a member and clear grouped inspection', async () => {
  regionProps.regions = [region('us-east-1'), region('us-east-2')]; regionProps.value = 'us-east-1'; const canvas = showRegion(); const originalWidth = box(canvas)[2]; let group = within(canvas).getByRole('button', {name: /Zoom to 2 Regions/}); assert.equal(group.getAttribute('aria-pressed'), null); fireEvent.focus(group); fireEvent.mouseEnter(group); assert.deepEqual(changed, []); await click(group); close(box(canvas)[2], originalWidth / 2); assert.equal(document.activeElement, canvas);
  group = within(canvas).getByRole('button', {name: /Zoom to 2 Regions/}); await click(group); close(box(canvas)[2], originalWidth / 4); const ohio = within(canvas).getByRole('button', {name: 'Select Ohio (us-east-2)'}); await click(ohio); assert.deepEqual(changed, ['us-east-2']);
});

test('missing Region locations retain the dropdown identity and do not invent a selectable marker', () => {
  regionProps.regions = []; regionProps.value = ''; const canvas = showRegion(); assert.ok(screen.getByText('No Region locations are available.')); assert.equal(screen.getByRole('status').textContent, 'No Region selected.'); assert.equal(controls(canvas).getByRole('button', {name: 'Show selected'}).disabled, true);
  updateRegion({regions: [region('future-region-1')], value: 'future-region-1'}); assert.match(screen.getByRole('status').textContent, /Selected: future-region-1. Map location unavailable/); assert.equal(within(canvas).queryByRole('button'), null);
});

test('Region resizing accepts real dimensions and ignores zero-sized observations', async () => {
  const canvas = showRegion(); const observer = observed.find(item => item.target === canvas); const initial = box(canvas); await act(async () => observer.callback([{contentRect: {width: 0, height: 400}}])); assert.deepEqual(box(canvas), initial); await act(async () => observer.callback([{contentRect: {width: 480, height: 640}}])); const resized = box(canvas); assert.notEqual(resized[2] / resized[3], initial[2] / initial[3]); assert.ok(canvas.querySelectorAll('use').length <= 12); mounted.unmount(); assert.equal(observer.disconnected, true);
});

test('Region keyboard navigation pans in all directions and keeps child keys and unrelated keys unchanged', () => {
  const canvas = showRegion(); const original = box(canvas); fireEvent.keyDown(canvas, {key: 'ArrowRight'}); assert.ok(center(canvas)[0] > 500); fireEvent.keyDown(canvas, {key: 'ArrowLeft'}); close(center(canvas)[0], 500); fireEvent.keyDown(canvas, {key: 'ArrowDown'}); assert.ok(center(canvas)[1] > 250); fireEvent.keyDown(canvas, {key: 'ArrowUp'}); close(center(canvas)[1], 250);
  fireEvent.keyDown(canvas, {key: '+'}); close(box(canvas)[2], original[2] / 2); fireEvent.keyDown(canvas, {key: '='}); close(box(canvas)[2], original[2] / 4); fireEvent.keyDown(canvas, {key: '-'}); close(box(canvas)[2], original[2] / 2); const zoomed = box(canvas); fireEvent.keyDown(canvas, {key: 'x'}); assert.deepEqual(box(canvas), zoomed); fireEvent.keyDown(within(canvas).getAllByRole('button')[0], {key: 'ArrowLeft'}); assert.deepEqual(box(canvas), zoomed); fireEvent.keyDown(canvas, {key: 'Home'}); assert.deepEqual(box(canvas), original);
});

test('Region pointer panning honors primary pointer ownership release capture and disabled state', () => {
  const canvas = showRegion(); const initial = box(canvas); pointer(canvas, 'pointerMove'); pointer(canvas, 'pointerDown', {isPrimary: false}); pointer(canvas, 'pointerMove', {clientX: 90}); assert.deepEqual(box(canvas), initial); pointer(canvas, 'pointerDown', {button: 2}); pointer(canvas, 'pointerMove', {clientX: 90}); assert.deepEqual(box(canvas), initial); pointer(marker(canvas, 'Select Oregon (us-west-2)'), 'pointerDown'); pointer(canvas, 'pointerMove', {clientX: 90}); assert.deepEqual(box(canvas), initial);
  pointer(canvas, 'pointerDown'); assert.equal(captures.get(canvas), 7); pointer(canvas, 'pointerMove', {pointerId: 8, clientX: 90}); assert.deepEqual(box(canvas), initial); pointer(canvas, 'pointerMove', {clientX: 90, clientY: 100}); assert.notDeepEqual(box(canvas), initial); const panned = box(canvas); updateRegion({disabled: true}); pointer(canvas, 'pointerMove', {clientX: 200}); assert.deepEqual(box(canvas), panned); pointer(canvas, 'pointerDown', {pointerId: 9}); assert.equal(captures.get(canvas), 7); pointer(canvas, 'pointerUp', {pointerId: 8}); assert.equal(captures.get(canvas), 7); pointer(canvas, 'pointerUp'); assert.equal(captures.has(canvas), false); fireEvent.lostPointerCapture(canvas); updateRegion({disabled: false}); pointer(canvas, 'pointerMove', {clientX: 200}); assert.deepEqual(box(canvas), panned);
});

test('wheel panning repeats both axes and handles pixel line page shift and browser zoom gestures', () => {
  const canvas = showRegion(); dimensions(canvas); const initial = box(canvas); for (const options of [{deltaX: 5401, deltaY: 3203}, {deltaX: 3, deltaY: 4, deltaMode: 1}, {deltaX: 0, deltaY: 1, deltaMode: 2}, {deltaX: 0, deltaY: 23, shiftKey: true}, {deltaX: 11, deltaY: 7, shiftKey: true}]) {const before = box(canvas); assert.equal(fireEvent.wheel(canvas, {cancelable: true, ...options}), false); assert.notDeepEqual(box(canvas), before); const [x, y] = center(canvas); assert.ok(x >= 0 && x < 1000); assert.ok(y >= 0 && y < 500); close(box(canvas)[2], initial[2]); close(box(canvas)[3], initial[3]);}
  const panned = box(canvas); assert.equal(fireEvent.wheel(canvas, {cancelable: true, deltaY: 50, ctrlKey: true}), true); assert.equal(fireEvent.wheel(canvas, {cancelable: true, deltaY: 50, metaKey: true}), true); assert.deepEqual(box(canvas), panned);
});

test('disabled Region maps expose disabled controls and never pan select or capture a pointer', async () => {
  regionProps.disabled = true; const canvas = showRegion(); const initial = box(canvas); assert.equal(canvas.tabIndex, -1); assert.equal(canvas.getAttribute('aria-disabled'), 'true'); for (const button of within(screen.getByRole('group', {name: 'Server Region controls'})).getAllByRole('button')) assert.equal(button.disabled, true);
  fireEvent.keyDown(canvas, {key: 'ArrowRight'}); fireEvent.wheel(canvas, {deltaY: 100}); pointer(canvas, 'pointerDown'); pointer(canvas, 'pointerMove', {clientX: 90}); await click(marker(canvas, 'Select Oregon (us-west-2)')); assert.deepEqual(changed, []); assert.equal(captures.has(canvas), false); assert.deepEqual(box(canvas), initial);
});

test('traffic paths animate across lifecycle states and only the explicit pause control changes motion', async () => {
  const canvas = showTraffic(); const paths = [...canvas.querySelectorAll('.traffic-flow')]; assert.ok(paths.length >= 3); assert.ok(paths.every(path => path.style.animationPlayState === 'running')); assert.match(screen.getByTestId('traffic-phase').textContent, /Scheduled transfer/); assert.ok(screen.getByText('Server → shared bottleneck → 2 receivers.'));
  updateTraffic({job: {...trafficProps.job, status: 'completed'}}); assert.equal(screen.getByTestId('traffic-phase').textContent, 'Completed · resources removed'); assert.ok([...canvas.querySelectorAll('.traffic-flow')].every(path => path.style.animationPlayState === 'running')); await click(screen.getByRole('button', {name: 'Pause animation'})); assert.equal(screen.getByRole('button', {name: 'Resume animation'}).getAttribute('aria-pressed'), 'true'); assert.ok([...canvas.querySelectorAll('.traffic-flow')].every(path => path.style.animationPlayState === 'paused')); await click(screen.getByRole('button', {name: 'Resume animation'})); assert.ok([...canvas.querySelectorAll('.traffic-flow')].every(path => path.style.animationPlayState === 'running'));
});

test('traffic machine inspection keeps actual instance details and measured zero throughput', async () => {
  trafficProps.job.nodes = [{...placement('ap-northeast-1'), name: 'receiver-1', role: 'receiver', instance_id: 'i-original-receiver', state: 'running'}]; trafficProps.job.results = [{receiver: 'receiver-1', received_mbit_per_second: 0, received_bytes: 0, seconds: 60, start_epoch: STAMP / 1000}]; showTraffic(); assert.ok(screen.getByText('4 machines · 4 Regions')); await selectMachine('Receiver 1 · ap-northeast-1'); assert.ok(screen.getByText('Receiver 1 · Tokyo')); assert.ok(screen.getByText('i-original-receiver · running')); assert.ok(screen.getByText('Measured throughput: 0.000 Mbit/s')); assert.ok(screen.getByText('ap-northeast-1 / ap-northeast-1-zone-1 · t3.medium')); await selectMachine('All machines'); assert.ok(screen.getByText('4 machines · 4 Regions'));
});

test('colocated machines remain individually inspectable and shared bottleneck markers retain their roles', async () => {
  trafficProps.job.config.receivers = [placement('us-east-2'), placement('us-east-2')]; const canvas = showTraffic(); await click(controls(canvas).getByRole('button', {name: 'World'})); await click(within(canvas).getByRole('button', {name: 'Inspect Ohio: Bottleneck, Receiver 1, Receiver 2'})); assert.ok(screen.getByText('Bottleneck · Ohio')); assert.ok(screen.getByText('Instance pending · Pending')); const group = within(screen.getByRole('group', {name: 'Machines in this Region'})); await click(group.getByRole('button', {name: 'Receiver 2', exact: true})); assert.ok(screen.getByText('Receiver 2 · Ohio')); assert.equal(group.getByRole('button', {name: 'Receiver 2', exact: true}).getAttribute('aria-pressed'), 'true'); assert.ok(canvas.querySelectorAll('path.traffic-flow').length > 0);
  updateTraffic({job: job({config: {...job().config, server: placement('us-east-2'), bottleneck: placement('us-east-2'), receivers: [placement('us-east-2')]}})}); assert.ok(screen.getByText('Server → shared bottleneck → receiver.')); await selectMachine('Server · us-east-2'); assert.ok(screen.getByText('Server · Ohio')); assert.ok(within(canvas).getByRole('button', {name: 'Inspect Ohio: Server, Bottleneck, Receiver 1'}));
});

test('traffic Region clusters expand geometrically before exposing individual machine markers', async () => {
  trafficProps.job.config = {...trafficProps.job.config, server: placement('us-east-1'), bottleneck: placement('us-east-2'), receivers: [placement('ap-northeast-1')]}; const canvas = showTraffic(); await click(controls(canvas).getByRole('button', {name: 'World'})); const width = box(canvas)[2]; await click(within(canvas).getByRole('button', {name: /Zoom to 2 Regions/})); close(box(canvas)[2], width / 2); assert.equal(document.activeElement, canvas); await click(within(canvas).getByRole('button', {name: /Zoom to 2 Regions/})); assert.ok(within(canvas).getByRole('button', {name: 'Inspect Ohio: Bottleneck'}));
});

test('unmapped traffic machines remain in the inspector and omitted hops never become invented direct paths', async () => {
  trafficProps.job.config.bottleneck = placement('future-region-1'); const canvas = showTraffic(); assert.match(screen.getByText(/Map coordinates unavailable/).textContent, /Bottleneck \(future-region-1\)/); assert.equal(canvas.querySelectorAll('[data-route]').length, 0); await selectMachine('Bottleneck · future-region-1'); assert.ok(screen.getByText('Bottleneck · future-region-1', {selector: 'p'})); assert.ok(screen.getByText('future-region-1 / future-region-1-zone-1 · t3.medium'));
  updateTraffic({job: {...trafficProps.job, config: {...trafficProps.job.config, server: placement('future-region-2'), receivers: [placement('future-region-3')]}}}); await click(controls(canvas).getByRole('button', {name: 'Fit topology'})); assert.ok(canvas.querySelectorAll('use').length > 0); assert.equal(within(canvas).queryByRole('button'), null);
});

test('traffic map resizing and bounded zoom preserve fit and world reset controls', async () => {
  const canvas = showTraffic(); const observer = observed.find(item => item.target === canvas); const initial = box(canvas); await act(async () => observer.callback([{contentRect: {width: 0, height: 0}}])); assert.deepEqual(box(canvas), initial); await act(async () => observer.callback([{contentRect: {width: 600, height: 480}}])); const panel = controls(canvas); await click(panel.getByRole('button', {name: 'World'})); const world = box(canvas); assert.equal(panel.getByRole('button', {name: 'Zoom out'}).disabled, true); for (let i = 0; i < 7; i++) await click(panel.getByRole('button', {name: 'Zoom in'})); assert.equal(panel.getByRole('button', {name: 'Zoom in'}).disabled, true); close(box(canvas)[2], world[2] / 64); await click(panel.getByRole('button', {name: 'Zoom out'})); close(box(canvas)[2], world[2] / 32); await click(panel.getByRole('button', {name: 'Fit topology'})); assert.notDeepEqual(box(canvas), world); mounted.unmount(); assert.equal(observer.disconnected, true); assert.equal(timers.size, 0);
});

test('traffic keyboard pointer and wheel panning remain independent of machine inspection', async () => {
  const canvas = showTraffic(); dimensions(canvas); const initial = box(canvas); for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', '+', '=', '-']) fireEvent.keyDown(canvas, {key}); const changed = box(canvas); fireEvent.keyDown(canvas, {key: 'x'}); assert.deepEqual(box(canvas), changed); fireEvent.keyDown(canvas, {key: 'Home'}); assert.deepEqual(box(canvas), initial);
  const marker = within(canvas).getAllByRole('button')[0]; fireEvent.keyDown(marker, {key: 'ArrowLeft'}); assert.deepEqual(box(canvas), initial); pointer(marker, 'pointerDown'); pointer(canvas, 'pointerMove', {clientX: 100}); assert.deepEqual(box(canvas), initial); pointer(canvas, 'pointerDown', {isPrimary: false}); pointer(canvas, 'pointerDown', {button: 2}); pointer(canvas, 'pointerMove', {clientX: 100}); assert.deepEqual(box(canvas), initial); pointer(canvas, 'pointerDown'); pointer(canvas, 'pointerMove', {pointerId: 8, clientX: 100}); assert.deepEqual(box(canvas), initial); pointer(canvas, 'pointerMove', {clientX: 100, clientY: 80}); assert.notDeepEqual(box(canvas), initial); pointer(canvas, 'pointerUp', {pointerId: 8}); assert.equal(captures.get(canvas), 7); pointer(canvas, 'pointerUp'); assert.equal(captures.has(canvas), false); fireEvent.lostPointerCapture(canvas); const after = box(canvas); pointer(canvas, 'pointerMove', {clientX: 200}); assert.deepEqual(box(canvas), after); fireEvent.wheel(canvas, {deltaX: 45, deltaY: 70}); assert.notDeepEqual(box(canvas), after);
});

test('traffic status timers detect stale updates and fresh receipts resume the recorded lifecycle', async t => {
  showTraffic(); t.mock.method(Date, 'now', () => STAMP + 16000); await act(async () => {for (const refresh of timers.values()) refresh();}); assert.equal(screen.getByTestId('traffic-phase').textContent, 'Status updates unavailable'); updateTraffic({receivedAt: STAMP + 16000}); assert.match(screen.getByTestId('traffic-phase').textContent, /Scheduled transfer/); updateTraffic({interrupted: true}); assert.equal(screen.getByTestId('traffic-phase').textContent, 'Status updates unavailable'); mounted.unmount(); assert.equal(timers.size, 0);
});
