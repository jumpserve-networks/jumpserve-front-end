import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

globalThis.__navigationReact = React;
const replacements = {
  'next/navigation': 'export const usePathname=()=>globalThis.__navigationUnit.pathname;',
  'next/link': `export default function Link({href,onNavigate,children,...props}){return globalThis.__navigationReact.createElement('a',{...props,href,onClick:e=>{e.preventDefault();onNavigate?.();}},children);}`,
  '@/app/components/auth-button': `export function GlobalAuthButton({placement}){return globalThis.__navigationReact.createElement('button',{'data-auth-placement':placement},'Synthetic account');}`,
};
const hook = registerHooks({resolve(specifier, context, next) {return Object.hasOwn(replacements, specifier) ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {AppShell} = await import('../app/components/app-shell.tsx');
const {SiteHeader} = await import('../app/components/site-header.tsx');
const {JumpServeLogo} = await import('../app/components/jumpserve-logo.tsx');
const {ModuleNavigation, MobileModuleNavigation} = await import('../app/components/module-navigation.tsx');
const {ThemeSelector} = await import('../app/components/theme-selector.tsx');
const {TEST_MODULES} = await import('../lib/test-modules.ts');
const theme = await import('../lib/theme-preference.ts');
hook.deregister();
const h = React.createElement;
let media;
beforeEach(() => {
  globalThis.__navigationUnit = {pathname: '/'};
  window.localStorage.clear(); document.cookie = 'theme-preference=; Max-Age=0; Path=/'; document.documentElement.className = '';
  media = new Map();
  window.matchMedia = query => {
    if (!media.has(query)) {
      const listeners = new Set();
      media.set(query, {media: query, matches: false, listeners,
        addEventListener: (_name, listener) => listeners.add(listener), removeEventListener: (_name, listener) => listeners.delete(listener)});
    }
    return media.get(query);
  };
});
afterEach(cleanup);
const click = element => act(async () => {fireEvent.click(element);});

test('theme icons persist the selected mode and keep exactly one pressed choice', async () => {
  render(h(ThemeSelector, {variant: 'icons'}));
  const group = screen.getByRole('group', {name: 'Color theme'});
  for (const [label, value] of [['Dark Mode', 'dark'], ['Light Mode', 'light'], ['System Default', 'system']]) {
    await click(within(group).getByRole('button', {name: label}));
    assert.equal(theme.readPreference(), value);
    assert.equal(within(group).getAllByRole('button').filter(button => button.getAttribute('aria-pressed') === 'true').length, 1);
    assert.equal(within(group).getByRole('button', {name: label}).getAttribute('aria-pressed'), 'true');
    assert.equal(document.documentElement.classList.contains('dark'), value === 'dark');
  }
});

test('theme dropdown displays the selected option and responds to a user choice', async () => {
  render(h(ThemeSelector));
  const trigger = screen.getByRole('combobox', {name: 'Theme'});
  await click(trigger);
  const option = screen.getByRole('option', {name: 'Dark Mode'});
  await act(async () => {fireEvent.pointerDown(option, {pointerType: 'mouse', button: 0, buttons: 1}); fireEvent.click(option, {detail: 1});});
  assert.equal(theme.readPreference(), 'dark'); assert.match(trigger.textContent, /Dark Mode/);
});

test('server theme controls use a stable default without selecting a stored browser mode', () => {
  theme.setThemePreference('dark');
  const markup = renderToStaticMarkup(h(ThemeSelector, {variant: 'icons'}));
  assert.match(markup, /aria-label="System Default" aria-pressed="true"/);
  assert.equal(theme.readPreference(), 'dark');
});

test('module navigation preserves canonical sections and highlights overview details or platform updates', () => {
  for (const testModule of [undefined, ...TEST_MODULES.filter(entry => entry.status === 'available')]) {
    let navigations = 0;
    render(h(ModuleNavigation, {testModule, pathname: testModule?.href ?? '/', onNavigate: () => navigations++}));
    const nav = screen.getByRole('navigation', {name: (testModule?.name ?? 'JumpServe') + ' navigation'});
    const links = within(nav).getAllByRole('link');
    assert.equal(links[0].textContent, 'Overview'); assert.equal(links[0].getAttribute('aria-current'), 'page');
    assert.deepEqual(links.map(link => link.getAttribute('href')), [testModule?.href ?? '/', ...(testModule?.sections ?? []).map(section => section.href), '/platform-updates']);
    fireEvent.click(links.at(-1)); assert.equal(navigations, 1);
    if (testModule?.id === 'research-verification' || !testModule) assert.equal(screen.queryByText('Test module'), null);
    else assert.ok(screen.getByText('Test module'));
    cleanup();
  }
  const testModule = TEST_MODULES.find(entry => entry.id === 'congestion-control-emulated');
  for (const pathname of ['/congestion-control-emulated/parent-run/42', '/platform-updates/original-update']) {
    render(h(ModuleNavigation, {testModule, pathname}));
    const current = screen.getAllByRole('link').filter(link => link.getAttribute('aria-current') === 'page');
    assert.equal(current.length, 1);
    assert.equal(current[0].getAttribute('href'), pathname.startsWith('/platform') ? '/platform-updates' : '/congestion-control-emulated/test-lookup');
    cleanup();
  }
});

test('mobile navigation opens accessibly and closes after navigation or a desktop transition', async () => {
  for (const testModule of [undefined, TEST_MODULES.find(entry => entry.id === 'research-verification')]) {
    const view = render(h(MobileModuleNavigation, {testModule, pathname: testModule?.href ?? '/'}));
    const trigger = screen.getByRole('button', {name: testModule ? 'Open module menu' : 'Open navigation menu'});
    assert.equal(trigger.disabled, false);
    await click(trigger);
    let dialog = screen.getByRole('dialog', {name: testModule?.name ?? 'JumpServe'});
    assert.match(dialog.textContent, testModule ? /Navigate between this module/ : /Navigate JumpServe/);
    await click(within(dialog).getByRole('link', {name: 'Platform Updates'}));
    await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
    await click(trigger); dialog = screen.getByRole('dialog');
    const desktop = media.get('(min-width: 1024px)');
    await act(async () => {desktop.matches = false; for (const listener of desktop.listeners) listener();});
    assert.equal(screen.getByRole('dialog'), dialog);
    await act(async () => {desktop.matches = true; for (const listener of desktop.listeners) listener();});
    await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
    view.unmount(); assert.equal(desktop.listeners.size, 0);
  }
});

test('mobile server render keeps the menu disabled until hydration', () => {
  const markup = renderToStaticMarkup(h(MobileModuleNavigation, {pathname: '/'}));
  assert.match(markup, /aria-label="Open navigation menu"/);
  assert.match(markup, /disabled=""/);
});

test('app shell keeps global pages and both research pathways connected to header and navigation', () => {
  for (const [pathname, pathway, label] of [['/', null, 'Site menu'], ['/research-verification/assessments', 'research-verification', 'Module menu'], ['/research-ideas/new-idea', 'research-ideas', 'Module menu'], ['/congestion-control-real-world/test-results', null, 'Module menu']]) {
    globalThis.__navigationUnit.pathname = pathname;
    const view = render(h(AppShell, null, h('h1', null, 'Recorded content')));
    assert.equal(document.querySelector('[data-slot="app-layout"]').getAttribute('data-module-theme'), pathway);
    assert.ok(screen.getByRole('complementary', {name: label}));
    assert.equal(screen.getByRole('link', {name: 'Skip to content'}).getAttribute('href'), '#page-content');
    assert.equal(screen.getByRole('heading', {name: 'Recorded content'}).closest('#page-content').tabIndex, -1);
    assert.equal(screen.getByRole('link', {name: 'JumpServe home'}).getAttribute('href'), '/');
    assert.equal(screen.getByRole('button', {name: 'Synthetic account'}).getAttribute('data-auth-placement'), 'header');
    assert.ok(screen.getByRole('group', {name: 'Color theme'}));
    view.unmount();
    assert.equal(media.get('(prefers-color-scheme: dark)').listeners.size, 0);
  }
});

test('standalone header and repeated logos retain home navigation and unique SVG references', () => {
  render(h(React.Fragment, null, h(SiteHeader), h(JumpServeLogo)));
  const logos = [...document.querySelectorAll('svg[viewBox="0 0 256 256"]')];
  assert.equal(logos.length, 2);
  const ids = logos.map(logo => logo.querySelector('mask').id);
  assert.notEqual(ids[0], ids[1]);
  for (const logo of logos) {
    assert.equal(logo.querySelector('image').getAttribute('href'), '/icon.png');
    assert.equal(logo.querySelector('rect').getAttribute('mask'), `url(#${logo.querySelector('mask').id})`);
    assert.equal(logo.getAttribute('aria-hidden'), 'true');
  }
  assert.equal(screen.getByRole('link', {name: 'Prompts'}).getAttribute('href'), '/prompts');
});
