import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,render,screen} from '@testing-library/react';
globalThis.__clearSelectReact=React;globalThis.__clearSelectValues=[];
const select=new URL('../app/components/ui/select.tsx',import.meta.url).href;
const replacements={
 '@/app/components/ui/select':`import {Select as Original} from ${JSON.stringify(select)};export * from ${JSON.stringify(select)};export function Select(props){globalThis.__clearSelectValues.push(props);return globalThis.__clearSelectReact.createElement(Original,props);}`,
 'next/link':"export default function Link({prefetch,...props}){return globalThis.__clearSelectReact.createElement('a',props);}",
 '@/app/components/user-preferences':"export function LocalDateTime(){return null;}",
};
const hook=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {ResearchSelect}=await import('../app/components/research-workflow/select.tsx');const {Prompts}=await import('../app/components/prompts.tsx');hook.deregister();afterEach(cleanup);

test('a cleared select emits an explicit empty value to its parent',async()=>{
 let selected='original';render(React.createElement(ResearchSelect,{value:'original',onChange:value=>{selected=value;},options:[{value:'original',label:'Original'}],label:'Original selection'}));
 await act(async()=>globalThis.__clearSelectValues.at(-1).onValueChange(null));assert.equal(selected,'');
});

test('clearing area and status filters restores the complete prompt catalogue',async()=>{
 render(React.createElement(Prompts,{prompts:[]}));const [area,status]=globalThis.__clearSelectValues.slice(-2);
 await act(async()=>{area.onValueChange(null);status.onValueChange(null);});assert.equal(screen.getByRole('status').textContent,'0 versions');assert.ok(screen.getByText('No saved prompts yet.'));
});
