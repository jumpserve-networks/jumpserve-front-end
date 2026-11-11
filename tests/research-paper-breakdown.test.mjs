import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {PAPER_BREAKDOWN_VERSION, validatePaperBreakdown} from '../lib/research-paper-breakdown.ts';
import {PaperBreakdownPanel} from '../app/components/research-workflow/paper-breakdown.tsx';

function fixture() {
  return {version: PAPER_BREAKDOWN_VERSION, status: 'ready', source_id: 'source', text_artifact_id: 'text', text_sha256: 'a'.repeat(64), policy_sha256: 'b'.repeat(64), cursor: 2, total_chunks: 2, total_pages: 3, missing_text_pages: [3], sections: {
    access: [{id: 'access-1', description: 'Authors used two Linux hosts.', quote: 'We used two Linux hosts.', page: 1}],
    experiment: [{id: 'experiment-1', description: 'Transfers were repeated three times.', quote: 'Each transfer was repeated three times.', page: 2}],
    data: [{id: 'data-1', description: 'RTT was recorded in ms.', quote: 'We recorded RTT in ms.', page: 2}], validate: [],
  }, limitation: 'Extracted text only; figures and supplements remain unreviewed. No independent validation.', reason: null};
}
const show = value => render(React.createElement(PaperBreakdownPanel, {value, version: PAPER_BREAKDOWN_VERSION, preparing: false, busy: false}));
afterEach(cleanup);

test('breakdown retains all four sections, exact quotes, page references, units and missing coverage', () => {
  const value = fixture(); assert.equal(validatePaperBreakdown(value), value); show(value);
  for (const name of ['Access', 'Experiment', 'Data', 'Validate']) assert.ok(screen.getByRole('heading', {name, exact: true}));
  assert.ok(screen.getByText('RTT was recorded in ms.')); assert.ok(screen.getByText('No readable text on PDF pages 3. Those pages remain uncovered.'));
  assert.ok(screen.getByText('No details identified in the text examined so far.'));
  const source = screen.getByText('Source quote · PDF page 1'); assert.equal(source.parentElement.querySelector('blockquote').textContent, value.sections.access[0].quote);
});

test('false coverage, invented pages, malformed sections and duplicate evidence identities fail closed', () => {
  for (const change of [value => value.version = 'unknown', value => value.cursor = 1, value => value.cursor = true, value => value.total_chunks = 0,
    value => value.sections.data[0].page = 3, value => value.sections.data[0].page = 4, value => value.sections.data[0].quote = '',
    value => value.sections.extra = [], value => delete value.sections.validate, value => value.sections.data[0].id = 'access-1',
    value => value.status = 'limited', value => value.missing_text_pages.push(3), value => value.text_sha256 = 'invalid']) {
    const value = fixture(); change(value); assert.throws(() => validatePaperBreakdown(value));
  }
  const value = fixture(); value.sections.access[0].quote = ''; show(value);
  assert.ok(screen.getByRole('alert')); assert.equal(screen.queryByText('Authors used two Linux hosts.'), null);
});

test('partial results remain readable with explicit progress and no ready or scientific-success claim', () => {
  const value = {...fixture(), status: 'preparing', cursor: 1}; show(value);
  assert.ok(screen.getByText('Preparing breakdown')); assert.ok(screen.getByText('1 of 2 extracted text chunks examined across 3 PDF pages.'));
  assert.equal(screen.queryByText('Text breakdown ready'), null); cleanup();
  show({...value, status: 'limited', reason: 'Original detail bound reached; remaining chunks are unexamined.'});
  assert.ok(screen.getByText('Partial breakdown')); assert.ok(screen.getByText('Original detail bound reached; remaining chunks are unexamined.'));
});

test('long sections show bounded pages without losing later details', async () => {
  const value = fixture(); value.sections.access = Array.from({length: 12}, (_, i) => ({id: `access-${i}`, description: `Resource detail ${i + 1}`, quote: `Exact resource quote ${i + 1}`, page: 1}));
  show(value); const access = screen.getByRole('region', {name: 'Access'});
  assert.equal(within(access).queryByText(/recorded details/), null); assert.equal(screen.queryByText('Resource detail 12'), null);
  await act(async () => {fireEvent.click(screen.getByRole('button', {name: 'Show more access details'}));});
  assert.ok(screen.getByText('Resource detail 12')); assert.equal(within(access).queryByText(/recorded details/), null);
});

test('older services, missing results and explicit preparation remain separate from automatic actions', async () => {
  let calls = 0; const props = {preparing: false, busy: false, onPrepare: () => calls++};
  render(React.createElement(PaperBreakdownPanel, props)); assert.ok(screen.getByText(/connected service needs the paper breakdown update/)); assert.equal(screen.queryByRole('button'), null); cleanup();
  render(React.createElement(PaperBreakdownPanel, {...props, version: PAPER_BREAKDOWN_VERSION}));
  assert.equal(calls, 0); await act(async () => {fireEvent.click(screen.getByRole('button', {name: 'Prepare four-section breakdown'}));}); assert.equal(calls, 1); cleanup();
  render(React.createElement(PaperBreakdownPanel, {...props, version: PAPER_BREAKDOWN_VERSION, preparing: true})); assert.equal(screen.queryByRole('button'), null); cleanup();
  render(React.createElement(PaperBreakdownPanel, {...props, value: fixture(), version: 'unsupported'})); assert.ok(screen.getByRole('alert')); assert.equal(screen.queryByText('Authors used two Linux hosts.'), null);
});
