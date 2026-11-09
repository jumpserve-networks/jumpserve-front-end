import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {act, cleanup, render, renderHook, screen, waitFor} from '@testing-library/react';

const browserAuthURL = new URL('../lib/browser-auth.ts', import.meta.url).href;
const sources = {
  '@/lib/supabase/client': 'export const createClient=()=>globalThis.__preferencesClient;',
  '@/lib/browser-auth': `export {hasResolvedAuthState} from ${JSON.stringify(browserAuthURL)};export const readBrowserSession=(...args)=>globalThis.__preferencesRead(...args);`,
};
const hook = registerHooks({resolve(specifier, context, next) {
  return sources[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(sources[specifier])} : next(specifier, context);
}});
const {UserPreferencesProvider, useUserPreferences, useTimeZone, useDateTime, LocalDateTime} = await import('../app/components/user-preferences.tsx');
hook.deregister();
const {browserTimeZone} = await import('../lib/date-time.ts');

const session = id => ({user: {id, app_metadata: {provider: 'google'}, identities: []}});
const profile = (id = 'owner', change = {}) => ({id, first_name: 'Fixture', last_name: 'Researcher', timezone: 'America/New_York', ...change});
function setup(t, initial = session('owner')) {
  let authChanged, unsubscribed = 0, reads = 0;
  const client = {auth: {onAuthStateChange(callback) {authChanged = callback; return {data: {subscription: {unsubscribe() {unsubscribed++;}}}};}}};
  globalThis.__preferencesClient = client;
  globalThis.__preferencesRead = async auth => {assert.equal(auth, client.auth); reads++; return initial;};
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({profile: profile()}));
  return {fetch, change(event, value) {assert.equal(typeof authChanged, 'function'); authChanged(event, value);}, get reads() {return reads;}, get unsubscribed() {return unsubscribed;}};
}
const wrapper = ({children}) => React.createElement(UserPreferencesProvider, null, children);
const preferences = () => renderHook(() => ({preferences: useUserPreferences(), zone: useTimeZone(), dateTime: useDateTime()}), {wrapper});
afterEach(() => {cleanup(); delete globalThis.__preferencesRead; delete globalThis.__preferencesClient;});

test('verified profiles load through same-origin API and local updates are restricted to the current actor', async t => {
  const state = setup(t);
  const {result} = preferences();
  assert.equal(result.current.preferences.loading, true);
  assert.equal(result.current.zone, null);
  assert.equal(result.current.dateTime('2026-01-01T00:00:00Z'), '…');
  await waitFor(() => assert.equal(result.current.preferences.loading, false));
  assert.deepEqual(result.current.preferences.profile, profile());
  assert.equal(result.current.zone, 'America/New_York');
  assert.notEqual(result.current.dateTime('2026-01-01T00:00:00Z'), '…');
  assert.notEqual(result.current.dateTime('2026-01-01T00:00:00Z', true), '…');
  assert.equal(state.fetch.mock.calls[0].arguments[0], '/api/profile');
  assert.equal(state.fetch.mock.calls[0].arguments[1].credentials, 'same-origin');
  assert.equal(state.fetch.mock.calls[0].arguments[1].cache, 'no-store');
  act(() => result.current.preferences.update(profile('other', {first_name: 'Wrong actor'})));
  assert.equal(result.current.preferences.profile.first_name, 'Fixture');
  act(() => result.current.preferences.update(profile('owner', {first_name: 'Updated'})));
  assert.equal(result.current.preferences.profile.first_name, 'Updated');
  act(() => state.change('TOKEN_REFRESHED', session('owner')));
  assert.equal(state.fetch.mock.callCount(), 1);
  act(() => state.change('INITIAL_SESSION', null));
  assert.equal(result.current.preferences.userId, 'owner');
  act(() => state.change('SIGNED_OUT', null));
  assert.equal(result.current.preferences.userId, null);
  assert.equal(result.current.preferences.profile, null);
});

test('anonymous and non-Google sessions never request an account profile', async t => {
  for (const initial of [null, {user: {id: 'email-owner', app_metadata: {provider: 'email'}, identities: []}}]) {
    const state = setup(t, initial);
    const {result, unmount} = preferences();
    await waitFor(() => assert.equal(result.current.preferences.loading, false));
    assert.equal(result.current.preferences.userId, null);
    assert.equal(result.current.zone, browserTimeZone());
    assert.equal(state.fetch.mock.callCount(), 0);
    unmount(); state.fetch.mock.restore();
  }
});

test('an account change aborts the prior read and ignores its late profile response', async t => {
  const state = setup(t);
  let resolveOld;
  state.fetch.mock.mockImplementationOnce(() => new Promise(resolve => {resolveOld = resolve;}));
  state.fetch.mock.mockImplementation(async () => Response.json({profile: profile('next-owner')}));
  const {result} = preferences();
  await waitFor(() => assert.equal(state.fetch.mock.callCount(), 1));
  const oldSignal = state.fetch.mock.calls[0].arguments[1].signal;
  await act(async () => {state.change('SIGNED_IN', session('next-owner'));});
  await waitFor(() => assert.equal(result.current.preferences.profile?.id, 'next-owner'));
  assert.equal(oldSignal.aborted, true);
  await act(async () => {resolveOld(Response.json({profile: profile()}));});
  assert.equal(result.current.preferences.profile.id, 'next-owner');
});

test('refresh retains the same actor profile while loading and a null timezone uses the browser preference', async t => {
  const state = setup(t);
  const {result} = preferences();
  await waitFor(() => assert.equal(result.current.preferences.profile?.id, 'owner'));
  let resolveRefresh;
  state.fetch.mock.mockImplementationOnce(() => new Promise(resolve => {resolveRefresh = resolve;}));
  await act(async () => {result.current.preferences.refresh();});
  assert.equal(result.current.preferences.loading, true);
  assert.deepEqual(result.current.preferences.profile, profile());
  await act(async () => {resolveRefresh(Response.json({profile: profile('owner', {timezone: null})}));});
  await waitFor(() => assert.equal(result.current.preferences.loading, false));
  assert.equal(result.current.zone, browserTimeZone());
});

test('profile transport, validation and unreadable errors remain recoverable without inventing profile data', async t => {
  for (const response of [new Response('{'), Response.json({error: 'Profile service unavailable'}, {status: 503}), Response.json({}, {status: 503}), Response.json({profile: profile('other')})]) {
    const state = setup(t);
    state.fetch.mock.mockImplementation(async () => response);
    const {result, unmount} = preferences();
    await waitFor(() => assert.equal(result.current.preferences.loading, false));
    assert.equal(result.current.preferences.profile, null);
    assert.equal(result.current.preferences.userId, 'owner');
    assert.notEqual(result.current.preferences.error, '');
    state.fetch.mock.mockImplementation(async () => Response.json({profile: profile()}));
    await act(async () => {result.current.preferences.refresh();});
    await waitFor(() => assert.equal(result.current.preferences.profile?.id, 'owner'));
    assert.equal(result.current.preferences.error, '');
    assert.equal(state.unsubscribed, 1);
    unmount(); state.fetch.mock.restore();
  }
});

test('an untyped profile failure gets an explicit fallback and browser timezone remains available', async t => {
  const state = setup(t);
  state.fetch.mock.mockImplementation(async () => {throw null;});
  const {result} = preferences();
  await waitFor(() => assert.equal(result.current.preferences.loading, false));
  assert.equal(result.current.preferences.error, 'Profile is unavailable.');
  assert.equal(result.current.zone, browserTimeZone());
});

test('failed authentication reads stay unknown and online retries reload the session', async t => {
  for (const error of [new Error('Synthetic auth outage'), null]) {
    const state = setup(t);
    globalThis.__preferencesRead = async () => {throw error;};
    const {result, unmount} = preferences();
    await waitFor(() => assert.equal(result.current.preferences.loading, false));
    assert.equal(result.current.preferences.error, error ? 'Synthetic auth outage' : 'Unable to check your sign-in. Please retry.');
    assert.equal(state.fetch.mock.callCount(), 0);
    globalThis.__preferencesRead = async () => session('owner');
    await act(async () => {window.dispatchEvent(new window.Event('online'));});
    await waitFor(() => assert.equal(result.current.preferences.profile?.id, 'owner'));
    unmount(); state.fetch.mock.restore();
  }
});

test('unmount aborts profile requests, removes subscriptions and ignores late session results', async t => {
  const state = setup(t);
  let resolveProfile;
  state.fetch.mock.mockImplementationOnce(() => new Promise(resolve => {resolveProfile = resolve;}));
  const {unmount} = preferences();
  await waitFor(() => assert.equal(state.fetch.mock.callCount(), 1));
  const signal = state.fetch.mock.calls[0].arguments[1].signal;
  unmount(); assert.equal(signal.aborted, true); assert.equal(state.unsubscribed, 1);
  await act(async () => {resolveProfile(Response.json({profile: profile()}));});
  let resolveSession;
  globalThis.__preferencesRead = () => new Promise(resolve => {resolveSession = resolve;});
  const next = preferences(); next.unmount();
  await act(async () => {resolveSession(session('owner'));});
  assert.equal(state.fetch.mock.callCount(), 1);
});

test('late rejected session reads after unmount do not create a profile request', async t => {
  const state = setup(t);
  let rejectSession;
  globalThis.__preferencesRead = () => new Promise((_resolve, reject) => {rejectSession = reject;});
  const {unmount} = preferences(); unmount();
  await act(async () => {rejectSession(new Error('Late session failure'));});
  assert.equal(state.fetch.mock.callCount(), 0);
});

test('date components retain missing timestamps and use server-stable placeholders before hydration', async t => {
  setup(t);
  assert.equal(renderHook(useUserPreferences).result.current, null);
  assert.equal(renderHook(useDateTime).result.current(null), 'Time unavailable');
  const html = renderToString(React.createElement(LocalDateTime, {value: '2026-01-01T00:00:00Z'}));
  assert.match(html, /<time dateTime="2026-01-01T00:00:00.000Z">…<\/time>/);
  const {rerender} = render(React.createElement(LocalDateTime, {value: null, fallback: 'Missing timestamp'}));
  assert.ok(screen.getByText('Missing timestamp'));
  rerender(React.createElement(LocalDateTime, {value: '2026-01-01T00:00:00Z', dateOnly: true}));
  const time = document.querySelector('time');
  assert.equal(time.dateTime, '2026-01-01T00:00:00.000Z');
  assert.notEqual(time.textContent, '…');
});
