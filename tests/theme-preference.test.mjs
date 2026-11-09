import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import * as theme from '../lib/theme-preference.ts';

let dark, changes;
beforeEach(() => {
  dark = false; changes = new Set(); window.localStorage.clear(); document.cookie = 'theme-preference=; Max-Age=0; Path=/'; document.documentElement.className = ''; document.documentElement.style.colorScheme = '';
  window.matchMedia = query => {assert.equal(query, '(prefers-color-scheme: dark)'); return {get matches() {return dark;}, addEventListener(event, handler) {assert.equal(event, 'change'); changes.add(handler);}, removeEventListener(event, handler) {assert.equal(event, 'change'); changes.delete(handler);}};};
});
afterEach(() => {assert.equal(changes.size, 0, 'Every media listener must be unsubscribed');});
const systemChange = value => {dark = value; for (const handler of changes) handler();};

test('unconfigured theme follows the system without inventing a stored preference', () => {
  assert.equal(theme.readPreference(), 'system'); assert.equal(theme.hasStoredPreference(), false);
  assert.equal(theme.resolveDarkMode('system'), false); dark = true; assert.equal(theme.resolveDarkMode('system'), true);
  assert.equal(theme.resolveDarkMode('dark'), true); assert.equal(theme.resolveDarkMode('light'), false);
});

test('cookie preference takes precedence over older local storage and only known values are accepted', () => {
  window.localStorage.setItem(theme.STORAGE_KEY, 'dark'); document.cookie = 'theme-preference=light; Path=/';
  assert.equal(theme.readPreference(), 'light'); assert.equal(theme.hasStoredPreference(), true);
  document.cookie = 'theme-preference=unsupported; Path=/'; assert.equal(theme.readPreference(), 'dark'); assert.match(document.cookie, /theme-preference=dark/);
  document.cookie = 'theme-preference=unsupported; Path=/'; window.localStorage.setItem(theme.STORAGE_KEY, 'unsupported'); assert.equal(theme.readPreference(), 'system'); assert.equal(theme.hasStoredPreference(), false);
});

test('legacy browser storage migrates to the cookie and preserves the selected mode', () => {
  window.localStorage.setItem(theme.STORAGE_KEY, 'system'); assert.equal(theme.hasStoredPreference(), true); assert.equal(document.cookie, '');
  assert.equal(theme.readPreference(), 'system'); assert.equal(document.cookie, 'theme-preference=system');
  document.cookie = 'unrelated=other; Path=/'; assert.equal(theme.readPreference(), 'system'); document.cookie = 'unrelated=; Max-Age=0; Path=/';
});

test('setting a theme updates storage cookie root class color scheme and subscribers together', () => {
  let notifications = 0; const unsubscribe = theme.subscribeToThemePreference(() => notifications++);
  theme.setThemePreference('dark'); assert.equal(notifications, 1); assert.equal(window.localStorage.getItem(theme.STORAGE_KEY), 'dark'); assert.equal(document.cookie, 'theme-preference=dark'); assert.equal(document.documentElement.classList.contains('dark'), true); assert.equal(document.documentElement.style.colorScheme, 'dark');
  theme.setThemePreference('light'); assert.equal(document.documentElement.classList.contains('dark'), false); assert.equal(document.documentElement.style.colorScheme, 'light'); assert.equal(notifications, 2);
  unsubscribe(); theme.emitThemePreferenceChange(); assert.equal(notifications, 2);
});

test('system changes apply and notify only while the selected mode is system', () => {
  let notifications = 0; const unsubscribe = theme.subscribeToThemePreference(() => notifications++);
  systemChange(true); assert.equal(document.documentElement.classList.contains('dark'), true); assert.equal(notifications, 1);
  theme.setThemePreference('light'); systemChange(false); systemChange(true); assert.equal(notifications, 2); assert.equal(document.documentElement.classList.contains('dark'), false);
  theme.setThemePreference('system'); assert.equal(document.documentElement.classList.contains('dark'), true); unsubscribe();
});

test('cross-tab storage events reapply the recorded theme and ignore unrelated keys', () => {
  let notifications = 0; const unsubscribe = theme.subscribeToThemePreference(() => notifications++);
  window.localStorage.setItem(theme.STORAGE_KEY, 'dark'); window.dispatchEvent(new window.StorageEvent('storage', {key: 'other'})); assert.equal(notifications, 0);
  window.dispatchEvent(new window.StorageEvent('storage', {key: theme.STORAGE_KEY})); assert.equal(notifications, 1); assert.equal(document.documentElement.classList.contains('dark'), true);
  unsubscribe(); window.dispatchEvent(new window.StorageEvent('storage', {key: theme.STORAGE_KEY})); assert.equal(notifications, 1);
});

test('external-store snapshots keep stable identity until an actual preference or persistence change', () => {
  const empty = theme.getThemePreferenceSnapshot(); assert.deepEqual(empty, {hasStoredPreference: false, preference: 'system'}); assert.equal(theme.getThemePreferenceSnapshot(), empty);
  window.localStorage.setItem(theme.STORAGE_KEY, 'system'); const stored = theme.getThemePreferenceSnapshot(); assert.notEqual(stored, empty); assert.deepEqual(stored, {hasStoredPreference: true, preference: 'system'});
  document.cookie = 'theme-preference=dark; Path=/'; const selected = theme.getThemePreferenceSnapshot(); assert.notEqual(selected, stored); assert.equal(theme.getThemePreferenceSnapshot(), selected);
  assert.deepEqual(theme.getServerThemePreferenceSnapshot(), {hasStoredPreference: false, preference: 'system'}); assert.equal(theme.getServerThemePreferenceSnapshot(), theme.getServerThemePreferenceSnapshot());
});

test('server rendering and a document-free environment do not access browser storage', () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window'), documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  try {
    delete globalThis.window; delete globalThis.document;
    assert.equal(theme.readPreference(), 'system'); assert.equal(theme.hasStoredPreference(), false); assert.equal(theme.resolveDarkMode('dark'), true); assert.equal(theme.resolveDarkMode('system'), false);
    theme.applyTheme('dark'); theme.setThemePreference('dark'); const unsubscribe = theme.subscribeToThemePreference(() => assert.fail('Server listener called')); unsubscribe();
    Object.defineProperty(globalThis, 'window', windowDescriptor); window.localStorage.setItem(theme.STORAGE_KEY, 'dark');
    assert.equal(theme.readPreference(), 'dark'); assert.equal(theme.hasStoredPreference(), true);
  } finally {Object.defineProperty(globalThis, 'window', windowDescriptor); Object.defineProperty(globalThis, 'document', documentDescriptor);}
});
