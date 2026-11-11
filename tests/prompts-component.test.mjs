import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

globalThis.__promptsReact = React;
const replacements = {
  'next/link': "export default function Link({prefetch,...props}){return globalThis.__promptsReact.createElement('a',props);}",
  '@/app/components/user-preferences': "export function LocalDateTime({value}){return globalThis.__promptsReact.createElement('time',{dateTime:value},value);}",
};
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {Prompts} = await import('../app/components/prompts.tsx');
hook.deregister();
afterEach(cleanup);

function item(index, area, version, status, updated = '2026-11-02T00:00:00Z') {
  return {id: '00000000-0000-4000-8000-' + String(index).padStart(12, '0'), module_id: area, version, active: status === 'Active', published_at: status === 'Draft' ? null : '2026-11-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z', updated_at: updated, content_sha256: 'f'.repeat(64)};
}
function fixture() {
  return [item(3, 'research-autonomy', 'Older published', 'Published', '2026-11-01T00:00:00Z'), item(7, 'research-experiment-builder', 'Builder current', 'Active'), item(4, 'research-autonomy', 'Published tie B', 'Published'), item(1, 'research-autonomy', 'Active assessment', 'Active', '2026-11-01T00:00:00Z'), item(5, 'research-autonomy', 'Draft assessment', 'Draft', '2026-11-03T00:00:00Z'), item(2, 'research-autonomy', 'Published tie A', 'Published'), item(8, 'custom-area', '<script>retained source text</script>', 'Draft')];
}
const titles = () => screen.queryAllByRole('heading', {level: 2}).map(node => node.textContent);
async function choose(label, option) {
  await act(async () => {fireEvent.click(screen.getByRole('combobox', {name: label}));});
  const target = await screen.findByRole('option', {name: option, exact: true});
  await act(async () => {fireEvent.pointerDown(target, {pointerType: 'mouse', button: 0, buttons: 1}); fireEvent.click(target, {detail: 1});});
  await waitFor(() => assert.equal(screen.getByRole('combobox', {name: label}).getAttribute('aria-expanded'), 'false'));
}

test('catalog orders by area active state recorded update time and stable identity without changing input', () => {
  const prompts = fixture(); const before = structuredClone(prompts); render(React.createElement(Prompts, {prompts}));
  assert.deepEqual(titles(), ['Active assessment', 'Draft assessment', 'Published tie A', 'Published tie B', 'Older published', '<script>retained source text</script>', 'Builder current']);
  assert.deepEqual(prompts, before); assert.equal(screen.getByRole('status').textContent, '7 versions');
  assert.equal(screen.getByRole('link', {name: 'Active assessment'}).getAttribute('href'), '/prompts/' + prompts[3].id);
  assert.equal(document.querySelector('script'), null); assert.equal(document.querySelectorAll('time').length, 7);
});

test('search trims and matches area identifier and version while keeping a singular count', () => {
  render(React.createElement(Prompts, {prompts: fixture()})); const search = screen.getByRole('searchbox', {name: 'Search prompts'});
  fireEvent.change(search, {target: {value: '  ACTIVE ASSESSMENT  '}}); assert.deepEqual(titles(), ['Active assessment']); assert.equal(screen.getByRole('status').textContent, '1 version');
  fireEvent.change(search, {target: {value: 'research-experiment-builder'}}); assert.deepEqual(titles(), ['Builder current']);
  fireEvent.change(search, {target: {value: 'unknown search'}}); assert.equal(screen.getByRole('status').textContent, '0 versions'); assert.ok(screen.getByText('No prompts match these filters.'));
  fireEvent.change(search, {target: {value: ' '}}); assert.equal(titles().length, 7);
});

test('area and status selections intersect and resetting both restores every original version', async () => {
  render(React.createElement(Prompts, {prompts: fixture()}));
  await choose('Area', 'Assessment autonomy'); assert.equal(titles().length, 5);
  await choose('Status', 'Published'); assert.deepEqual(titles(), ['Published tie A', 'Published tie B', 'Older published']);
  await choose('Status', 'Draft'); assert.deepEqual(titles(), ['Draft assessment']);
  await choose('Status', 'Active'); assert.deepEqual(titles(), ['Active assessment']);
  fireEvent.change(screen.getByRole('searchbox', {name: 'Search prompts'}), {target: {value: 'Builder'}}); assert.equal(titles().length, 0);
  fireEvent.change(screen.getByRole('searchbox', {name: 'Search prompts'}), {target: {value: ''}});
  await choose('Area', 'Experiment builder'); assert.deepEqual(titles(), ['Builder current']);
  await choose('Status', 'All versions'); await choose('Area', 'All areas'); assert.equal(titles().length, 7);
});

test('an empty saved catalog stays distinct from a search with no matches', () => {
  render(React.createElement(Prompts, {prompts: []})); assert.equal(screen.getByRole('status').textContent, '0 versions'); assert.ok(screen.getByText('No saved prompts yet.')); assert.equal(screen.queryByText('No prompts match these filters.'), null);
});

test('paper assessment templates can be found and filtered as recorded versions',async()=>{
 const recorded={...item(9,'research-paper-intake','paper-assessment-original','Draft'),recorded:true};
 render(React.createElement(Prompts,{prompts:[...fixture(),recorded]}));
 await choose('Area','Paper assessment');await choose('Status','Recorded');assert.deepEqual(titles(),[recorded.version]);
 assert.equal(screen.getByRole('link',{name:recorded.version}).getAttribute('href'),'/prompts/'+recorded.id);assert.ok(screen.getByText('Recorded',{selector:'[data-slot="badge"]'}));
});
