// Root composition and pre-hydration theme initialization, isolated from Next's
// font compiler and application providers. No browser integration is claimed.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {STORAGE_KEY, THEME_PREFERENCE_COOKIE_NAME, DARK_MEDIA_QUERY} from '../lib/theme-preference-shared.ts';

globalThis.__layoutReact = React;
globalThis.__layoutFonts = [];
const providers = {
  '@/app/components/app-shell': 'AppShell',
  '@/app/components/user-preferences': 'UserPreferencesProvider',
  '@/app/components/research-workflow/paper-uploads-provider': 'PaperUploadsProvider',
};
const hook = registerHooks({resolve(specifier, context, next) {
  let source;
  if (specifier === 'next/font/local') source = 'export default function font(options){globalThis.__layoutFonts.push(options);return {variable:options.variable};}';
  else if (specifier.endsWith('.css')) source = 'export default {};';
  else if (providers[specifier]) source = `export function ${providers[specifier]}({children}){return globalThis.__layoutReact.createElement("div",{"data-provider":${JSON.stringify(providers[specifier])}},children);}`;
  return source ? {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(source)} : next(specifier, context);
}});
const {default: RootLayout, metadata} = await import('../app/layout.tsx');
hook.deregister();

test('root layout preserves document language local font configuration provider ordering and page metadata', () => {
  const document = new JSDOM(renderToStaticMarkup(React.createElement(RootLayout, {}, React.createElement('main', {}, 'Page content')))).window.document;
  assert.equal(document.documentElement.lang, 'en');
  assert.ok(document.body.classList.contains('--font-geist-sans'));
  assert.ok(document.body.classList.contains('--font-geist-mono'));
  assert.equal(document.querySelector('[data-provider="UserPreferencesProvider"] > [data-provider="PaperUploadsProvider"] > [data-provider="AppShell"] > main').textContent, 'Page content');
  assert.deepEqual(globalThis.__layoutFonts.map(font => [font.variable,font.display,font.weight]), [['--font-geist-sans','swap','100 900'],['--font-geist-mono','swap','100 900']]);
  assert.equal(metadata.title.template, '%s | Jumpserve');
  assert.match(metadata.description, /experiments, measurements and reproducible evidence/);
});

function theme({cookie, storage, systemDark=false, failure}={}) {
  return new JSDOM(renderToStaticMarkup(React.createElement(RootLayout)), {
    url:'https://example.test/',runScripts:'dangerously',
    beforeParse(window) {
      if (cookie !== undefined) window.document.cookie = THEME_PREFERENCE_COOKIE_NAME+'='+cookie+'; Path=/';
      if (storage !== undefined) window.localStorage.setItem(STORAGE_KEY,storage);
      window.matchMedia = query => {assert.equal(query,DARK_MEDIA_QUERY);return {matches:systemDark};};
      if (failure) Object.defineProperty(window,'localStorage',{get(){throw new Error('Synthetic blocked browser storage');}});
    },
  });
}

test('theme cookie has priority and synchronizes browser storage before hydration', () => {
  for (const preference of ['dark','light','system']) {
    const dom = theme({cookie:preference,storage:'dark',systemDark:false});
    assert.equal(dom.window.document.documentElement.classList.contains('dark'),preference==='dark');
    assert.equal(dom.window.document.documentElement.style.colorScheme,preference==='dark'?'dark':'light');
    assert.equal(dom.window.localStorage.getItem(STORAGE_KEY),preference);dom.window.close();
  }
});

test('legacy valid theme storage is migrated to a cookie and system mode follows the current media state', () => {
  for (const preference of ['dark','light','system']) {
    const dom = theme({storage:preference,systemDark:true});
    assert.equal(dom.window.document.documentElement.classList.contains('dark'),preference!=='light');
    assert.ok(dom.window.document.cookie.includes(THEME_PREFERENCE_COOKIE_NAME+'='+preference));dom.window.close();
  }
});

test('invalid preferences use the system theme while storage and malformed cookie failures remain contained', () => {
  for (const options of [{cookie:'unknown',storage:'unknown',systemDark:true},{systemDark:false},{cookie:'%XX'},{failure:true}]) {
    const dom=theme(options);
    assert.equal(dom.window.document.documentElement.classList.contains('dark'),options.systemDark===true);
    assert.ok(dom.window.document.querySelector('body'));dom.window.close();
  }
});
