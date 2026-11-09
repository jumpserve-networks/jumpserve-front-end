import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import React from 'react';
import {act, cleanup, render, renderHook, screen, waitFor} from '@testing-library/react';
import {PaperAuthors, usePaperBibliography} from '../app/components/research-workflow/paper-bibliography.tsx';

const paper = (index, change = {}) => ({id: `43000000-0000-4000-8000-${String(index).padStart(12, '0')}`, title: null, authors: null, ...change});
const response = item => Response.json({version: 'research-paper-catalog-v1', access: 'public-read-only', id: item.id, title: `Paper ${item.id}`, authors: ['Fixture Author']});
const original = process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;
afterEach(() => {cleanup(); if (original === undefined) delete process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL; else process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL = original;});

test('missing input and complete recorded bibliography do not make unnecessary reads', t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {assert.fail('No bibliography request expected');});
  const {result, rerender} = renderHook(({papers}) => usePaperBibliography(papers), {initialProps: {papers: undefined}});
  assert.deepEqual(result.current, {});
  rerender({papers: [paper(1, {title: 'Recorded title', authors: ['Recorded Author']})]});
  assert.deepEqual(result.current, {});
  assert.equal(fetch.mock.callCount(), 0);
});

test('at most two bibliography reads run concurrently and every pending paper retains its own identity', async t => {
  process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL = 'https://catalog.example.test';
  const papers = [paper(1), paper(2), paper(3), paper(4)];
  const pending = [];
  const fetch = t.mock.method(globalThis, 'fetch', (url, options) => new Promise(resolve => {pending.push({url, options, resolve});}));
  const {result} = renderHook(() => usePaperBibliography(papers));
  assert.equal(pending.length, 2);
  assert.equal(pending[0].options.credentials, 'omit');
  assert.equal(pending[0].options.headers.Authorization, undefined);
  await act(async () => {pending[1].resolve(response(papers[1]));});
  await waitFor(() => assert.equal(pending.length, 3));
  assert.equal(result.current[papers[1].id].authors[0], 'Fixture Author');
  await act(async () => {pending[0].resolve(response(papers[0]));});
  await waitFor(() => assert.equal(pending.length, 4));
  await act(async () => {pending[2].resolve(response(papers[2])); pending[3].resolve(response(papers[3]));});
  await waitFor(() => assert.equal(Object.keys(result.current).length, 4));
  assert.equal(fetch.mock.callCount(), 4);
  assert.deepEqual(pending.map(item => new URL(item.url).pathname), papers.map(item => `/research/papers/${item.id}/title`));
  for (const item of papers) assert.equal(result.current[item.id].title, `Paper ${item.id}`);
});

test('metadata outages keep the recorded title and leave unknown authors explicitly missing', async t => {
  process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL = 'https://catalog.example.test';
  t.mock.method(globalThis, 'fetch', async () => {throw new Error('Synthetic service outage');});
  const papers = [paper(1, {title: 'Retained title'}), paper(2)];
  const {result} = renderHook(() => usePaperBibliography(papers));
  await waitFor(() => assert.equal(Object.keys(result.current).length, 2));
  assert.deepEqual(result.current[papers[0].id], {title: 'Retained title', authors: null});
  assert.deepEqual(result.current[papers[1].id], {title: 'Paper title unavailable', authors: null});
});

test('a changed input list aborts both old workers and discards late old results', async t => {
  process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL = 'https://catalog.example.test';
  const pending = [];
  t.mock.method(globalThis, 'fetch', (url, options) => new Promise(resolve => {pending.push({url, signal: options.signal, resolve});}));
  const first = [paper(1), paper(2), paper(3)], second = [paper(4)];
  const {result, rerender, unmount} = renderHook(({papers}) => usePaperBibliography(papers), {initialProps: {papers: first}});
  assert.equal(pending.length, 2);
  rerender({papers: second});
  assert.equal(pending[0].signal.aborted, true);
  assert.equal(pending[1].signal.aborted, true);
  assert.equal(pending.length, 3);
  await act(async () => {pending[0].resolve(response(first[0])); pending[1].resolve(response(first[1])); pending[2].resolve(response(second[0]));});
  await waitFor(() => assert.deepEqual(Object.keys(result.current), [second[0].id]));
  assert.equal(pending.length, 3); // The cancelled worker never starts paper 3.
  rerender({papers: [paper(5)]});
  assert.equal(pending.length, 4);
  unmount(); assert.equal(pending[3].signal.aborted, true);
  await act(async () => {pending[3].resolve(response(paper(5)));});
});

test('authors display preserves order and distinguishes loading, invalid and unavailable values', () => {
  const {rerender} = render(React.createElement(PaperAuthors, {authors: ['Ada Author', 'Zoë Researcher']}));
  assert.ok(screen.getByText('Ada Author, Zoë Researcher'));
  rerender(React.createElement(PaperAuthors, {loading: true}));
  assert.ok(screen.getByText('Reading authors…'));
  rerender(React.createElement(PaperAuthors, {authors: ['not-an-author@example.test']}));
  assert.ok(screen.getByText('Authors unavailable'));
  rerender(React.createElement(PaperAuthors));
  assert.ok(screen.getByText('Authors unavailable'));
});
