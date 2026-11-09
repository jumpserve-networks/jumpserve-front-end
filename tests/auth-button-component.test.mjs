import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';

const authUrl = new URL('../lib/browser-auth.ts', import.meta.url).href;
const replacements = {
  'next/link': "export default function Link(props) {return globalThis.__authReact.createElement('a',props);}",
  'next/navigation': 'export const usePathname=()=>globalThis.__authPath;',
  '@/lib/supabase/client': 'export const createClient=()=>globalThis.__authDatabase;',
  '@/lib/browser-auth': `export {hasResolvedAuthState} from ${JSON.stringify(authUrl)}; export const readBrowserSession=(...args)=>globalThis.__authRead(...args);`,
  '@/app/components/user-preferences': 'export const useUserPreferences=()=>globalThis.__authPreferences;',
};
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {AuthButton, GlobalAuthButton} = await import('../app/components/auth-button.tsx'); hook.deregister();
let originalWindow, location, navigations, subscribers, unsubscribed, oauthCalls, preferencesRefreshes, siteUrl;
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const session = (metadata = {}, extra = {}) => ({user: {id: 'fixture-user', email: 'fixture@example.test', is_anonymous: false, app_metadata: {provider: 'google'}, user_metadata: metadata, ...extra}});
beforeEach(() => {
  originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'); siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  globalThis.__authReact = React;
  location = {href: 'http://localhost:6001/login', assign: path => navigations.push(path)}; navigations = []; subscribers = []; unsubscribed = 0; oauthCalls = []; preferencesRefreshes = 0;
  const real = originalWindow.value;
  Object.defineProperty(globalThis, 'window', {configurable: true, value: new Proxy(real, {get(target, name) {if (name === 'location') return location; const value = Reflect.get(target, name, target); return typeof value === 'function' ? value.bind(target) : value;}})});
  globalThis.__authPath = '/'; globalThis.__authRead = async () => null; globalThis.__authPreferences = {profile: null, refresh() {preferencesRefreshes++;}};
  globalThis.__authOAuth = async () => ({error: null}); globalThis.__authSignout = async () => ({error: null});
  globalThis.__authDatabase = {auth: {
    onAuthStateChange(listener) {subscribers.push(listener); return {data: {subscription: {unsubscribe() {unsubscribed++;}}}};},
    signInWithOAuth(options) {oauthCalls.push(options); return globalThis.__authOAuth();},
    signOut() {return globalThis.__authSignout();},
  }};
  delete process.env.NEXT_PUBLIC_SITE_URL;
});
afterEach(async () => {await act(async () => {}); cleanup(); Object.defineProperty(globalThis, 'window', originalWindow); if (siteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = siteUrl; for (const name of ['React', 'Path', 'Read', 'Preferences', 'OAuth', 'Signout', 'Database']) delete globalThis['__auth' + name];});
async function show(props = {}, Component = AuthButton) {let view; await act(async () => {view = render(React.createElement(Component, props));}); return view;}
async function authEvent(event, value) {await act(async () => {for (const listener of subscribers) listener(event, value);});}
async function click(name) {await act(async () => fireEvent.click(screen.getByRole('button', {name})));}

test('global control is absent on login and otherwise starts with a disabled unresolved session', async () => {
  globalThis.__authPath = '/login'; const login = await show({}, GlobalAuthButton); assert.equal(screen.queryByRole('button'), null); login.unmount();
  globalThis.__authPath = '/'; const pending = deferred(); globalThis.__authRead = () => pending.promise;
  await show({}, GlobalAuthButton); assert.equal(screen.getByRole('button', {name: 'Checking login...'}).disabled, true); assert.equal(subscribers.length, 0);
  await act(async () => pending.resolve(null)); assert.equal(screen.getByRole('button', {name: 'Sign in'}).disabled, false); assert.equal(subscribers.length, 1);
});

test('Google sessions show the matching saved profile name before Google metadata', async () => {
  globalThis.__authRead = async () => session({full_name: 'Google Name'}); globalThis.__authPreferences.profile = {id: 'fixture-user', first_name: 'Ada', last_name: 'Lovelace'};
  await show({placement: 'header'}); assert.ok(screen.getByRole('link', {name: 'Your profile'})); assert.ok(screen.getByText('Ada Lovelace')); assert.equal(screen.queryByText('Google Name'), null); assert.ok(screen.getByRole('button', {name: 'Log out'}));
});

test('names from another profile are never displayed and Google metadata has bounded fallbacks', async () => {
  for (const [metadata, user, name] of [[{full_name: 'Google Full'}, {}, 'Google Full'], [{name: 'Google Display'}, {}, 'Google Display'], [{}, {}, 'fixture@example.test'], [{}, {email: undefined}, 'Profile']]) {
    globalThis.__authRead = async () => session(metadata, user); globalThis.__authPreferences.profile = {id: 'different-user', first_name: 'Private other name', last_name: 'Hidden'};
    const view = await show(); assert.ok(screen.getByText(name)); assert.equal(screen.queryByText('Private other name Hidden'), null); view.unmount();
  }
});

test('blank saved names fall back to current Google identity and single saved names remain intact', async () => {
  globalThis.__authRead = async () => session({full_name: 'Current Name'}); globalThis.__authPreferences.profile = {id: 'fixture-user', first_name: '', last_name: ''};
  let view = await show(); assert.ok(screen.getByText('Current Name')); view.unmount();
  globalThis.__authPreferences.profile.last_name = 'Recorded'; view = await show(); assert.ok(screen.getByText('Recorded')); view.unmount();
  globalThis.__authPreferences = null; await show(); assert.ok(screen.getByText('Current Name'));
});

test('anonymous or non-Google sessions remain logged out while valid auth events update the identity', async () => {
  globalThis.__authRead = async () => session({}, {is_anonymous: true}); await show({placement: 'inline'}); assert.ok(screen.getByRole('button', {name: 'Login with Google'}));
  await authEvent('INITIAL_SESSION', null); assert.ok(screen.getByRole('button', {name: 'Login with Google'}));
  await authEvent('SIGNED_IN', session({full_name: 'Verified Google'})); assert.ok(screen.getByText('Verified Google'));
  await authEvent('SIGNED_IN', session({}, {app_metadata: {provider: 'email'}})); assert.ok(screen.getByRole('button', {name: 'Login with Google'}));
  await authEvent('SIGNED_OUT', null); assert.equal(screen.queryByRole('button', {name: 'Log out'}), null);
});

test('failed session reads support an explicit retry and refresh profile preferences', async () => {
  globalThis.__authRead = async () => {throw new Error('Synthetic refresh unavailable');}; await show({placement: 'header'});
  assert.equal(screen.getByRole('alert').textContent, 'Synthetic refresh unavailable'); assert.ok(screen.getByRole('button', {name: 'Retry connection'}));
  globalThis.__authRead = async () => session({full_name: 'Recovered User'}); await click('Retry connection'); assert.equal(preferencesRefreshes, 1); assert.ok(screen.getByText('Recovered User')); assert.equal(screen.queryByRole('alert'), null);
});

test('untyped session failures show a usable retry instead of pretending that the user signed out', async () => {
  globalThis.__authRead = async () => {throw null;}; globalThis.__authPreferences = null; await show({placement: 'inline'});
  assert.equal(screen.getByRole('alert').textContent, 'Unable to check your sign-in. Please retry.'); assert.ok(screen.getByRole('button', {name: 'Retry connection'}));
  globalThis.__authRead = async () => null; await click('Retry connection'); assert.ok(screen.getByRole('button', {name: 'Login with Google'}));
});

test('login preserves the current tool and query through the login route without immediately invoking OAuth', async () => {
  location.href = 'http://localhost:6001/research-verification/assessments?scope=mine'; await show({placement: 'header'}); await click('Sign in');
  assert.deepEqual(navigations, ['/login?next=%2Fresearch-verification%2Fassessments%3Fscope%3Dmine']); assert.equal(oauthCalls.length, 0); assert.equal(screen.getByRole('button', {name: 'Opening sign-in...'}).disabled, true);
});

test('home sign-in keeps a concise login URL and inline control reflects pending navigation', async () => {
  location.href = 'http://localhost:6001/'; await show({placement: 'inline'}); await click('Login with Google'); assert.deepEqual(navigations, ['/login']); assert.equal(screen.getByRole('button', {name: 'Opening Google...'}).disabled, true);
});

test('Google OAuth uses the canonical callback origin and a safe requested return path', async () => {
  process.env.NEXT_PUBLIC_SITE_URL = ' https://jumpserve.example.test/ignored/path '; location.href = 'http://localhost:6001/login?next=%2Fresearch-verification%2Fassessments%3Fscope%3Dmine';
  await show({placement: 'inline'}); await click('Login with Google'); assert.deepEqual(oauthCalls, [{provider: 'google', options: {scopes: 'openid profile email', redirectTo: 'https://jumpserve.example.test/auth/callback?next=%2Fresearch-verification%2Fassessments%3Fscope%3Dmine'}}]);
  assert.deepEqual(navigations, []); assert.equal(screen.getByRole('button', {name: 'Opening Google...'}).disabled, true);
});

test('unconfigured callback uses the actual browser origin and an external next URL is rejected', async () => {
  location.href = 'http://localhost:6001/login?next=https%3A%2F%2Funtrusted.example%2F'; globalThis.__authOAuth = async () => ({error: {message: 'Synthetic OAuth rejection'}});
  await show({placement: 'inline'}); await click('Login with Google'); assert.equal(oauthCalls[0].options.redirectTo, 'http://localhost:6001/auth/callback?next=%2F');
  assert.equal(screen.getByRole('alert').textContent, 'Synthetic OAuth rejection'); assert.equal(screen.getByRole('button', {name: 'Login with Google'}).disabled, false);
});

test('failed sign-out keeps the current identity and success returns to home', async () => {
  globalThis.__authRead = async () => session({full_name: 'Retained User'}); globalThis.__authSignout = async () => ({error: {message: 'Synthetic sign-out failure'}});
  await show(); await click('Log out'); assert.ok(screen.getByText('Retained User')); assert.equal(screen.getByRole('alert').textContent, 'Synthetic sign-out failure'); assert.deepEqual(navigations, []);
  const pending = deferred(); globalThis.__authSignout = () => pending.promise; await click('Log out'); assert.equal(screen.getByRole('button', {name: 'Logging out...'}).disabled, true);
  await act(async () => pending.resolve({error: null})); assert.deepEqual(navigations, ['/']);
});

test('a newer auth event wins over both stale successful and failed online session reads', async () => {
  globalThis.__authRead = async () => session({full_name: 'Initial User'}); await show(); const first = deferred(), second = deferred(); let calls = 0;
  globalThis.__authRead = () => (++calls === 1 ? first.promise : second.promise);
  await act(async () => {window.dispatchEvent(new window.Event('online')); window.dispatchEvent(new window.Event('online'));});
  await authEvent('SIGNED_IN', session({full_name: 'Current User'}));
  await act(async () => {first.resolve(session({full_name: 'Stale User'})); second.reject(new Error('Stale refresh error'));});
  assert.ok(screen.getByText('Current User')); assert.equal(screen.queryByText('Stale User'), null); assert.equal(screen.queryByRole('alert'), null); assert.equal(subscribers.length, 1);
});

test('online recovery reuses the subscription and unresolved auth events do not clear a known Google user', async () => {
  globalThis.__authRead = async () => session({full_name: 'Known User'}); const view = await show(); await authEvent('TOKEN_REFRESHED', null); assert.ok(screen.getByText('Known User'));
  globalThis.__authRead = async () => session({full_name: 'Refreshed User'}); await act(async () => window.dispatchEvent(new window.Event('online')));
  assert.ok(screen.getByText('Refreshed User')); assert.equal(subscribers.length, 1); view.unmount(); assert.equal(unsubscribed, 1);
  await act(async () => subscribers[0]('SIGNED_IN', session({full_name: 'After unmount'}))); assert.equal(screen.queryByText('After unmount'), null);
});

test('unmounted initial session reads cannot subscribe or render late success and failure states', async () => {
  for (const fail of [false, true]) {
    const pending = deferred(); globalThis.__authRead = () => pending.promise; const view = await show(); view.unmount();
    await act(async () => fail ? pending.reject(new Error('Late initial error')) : pending.resolve(session({full_name: 'Late initial user'})));
    assert.equal(subscribers.length, 0); assert.equal(screen.queryByText('Late initial user'), null); assert.equal(screen.queryByRole('alert'), null);
  }
});
