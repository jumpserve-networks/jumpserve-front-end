import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
const replacements={
 '@/app/components/user-preferences':'export const useUserPreferences=()=>globalThis.__profilePreferences;',
 '@/app/profile/actions':'export const saveProfile=(...args)=>globalThis.__profileSave(...args);',
};
const hooks=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {ProfileEditor}=await import('../app/components/profile-editor.tsx');hooks.deregister();
let saved,calls;
beforeEach(()=>{saved=[];calls=[];globalThis.__profilePreferences={loading:false,profile:{id:'synthetic',first_name:'Original',last_name:'Owner',timezone:'UTC'},update:p=>saved.push(p),refresh:()=>calls.push('refresh')};globalThis.__profileSave=async input=>{calls.push(input);return{profile:{id:'synthetic',...input}};};});afterEach(cleanup);
const change=async(label,value)=>act(async()=>fireEvent.change(screen.getByLabelText(label),{target:{value}}));
const submit=async()=>act(async()=>fireEvent.submit(document.querySelector('form')));
test('profile loading missing profiles and explicit read failures retain retry control',async()=>{
 for(const preferences of [null,{loading:true}]){globalThis.__profilePreferences=preferences;render(React.createElement(ProfileEditor));assert.ok(screen.getByText('Loading your profile…'));cleanup();}
 for(const error of ['Synthetic profile read failed','']){globalThis.__profilePreferences={profile:null,error,refresh:()=>calls.push('refresh')};render(React.createElement(ProfileEditor));assert.match(screen.getByRole('alert').textContent,error?new RegExp(error):/unavailable/);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Try again'})));cleanup();}assert.equal(calls.length,2);
});
test('profile form trims names saves validated timezone updates preferences and resets saved notice after edits',async()=>{
 render(React.createElement(ProfileEditor));await change('First name',' New ');await change('Last name',' Owner ');await change('Time zone','America/Chicago');await submit();assert.deepEqual(calls[0],{first_name:'New',last_name:'Owner',timezone:'America/Chicago'});assert.equal(saved[0].id,'synthetic');assert.ok(screen.getByText('Profile saved.'));assert.equal(screen.getByLabelText('First name').value,'New');await change('First name','Updated');assert.equal(screen.queryByText('Profile saved.'),null);
});
test('invalid timezone and unconfirmed save results never update the stored profile',async()=>{
 render(React.createElement(ProfileEditor));await change('Time zone','Invalid/Zone');await submit();assert.match(screen.getByRole('alert').textContent,/valid time zone/);assert.equal(calls.length,0);await change('Time zone','UTC');
 for(const result of [{error:'Synthetic profile conflict'},{}]){globalThis.__profileSave=async()=>result;await submit();assert.equal(screen.getByRole('alert').textContent,result.error??'Profile was not saved.');}
 globalThis.__profileSave=async()=>{throw null;};await submit();assert.equal(screen.getByRole('alert').textContent,'Your profile could not be saved.');assert.equal(saved.length,0);
});
test('profile saves disable fields while pending and missing timezone defaults to the browser',async()=>{
 globalThis.__profilePreferences.profile.timezone=null;let resolve;globalThis.__profileSave=()=>new Promise(done=>{resolve=done;});render(React.createElement(ProfileEditor));assert.ok(screen.getByLabelText('Time zone').value);await submit();assert.equal(screen.getByLabelText('First name').disabled,true);assert.equal(screen.getByRole('button',{name:'Saving…'}).disabled,true);await act(async()=>resolve({profile:{id:'synthetic',first_name:'Original',last_name:'Owner',timezone:'UTC'}}));assert.equal(screen.getByLabelText('First name').disabled,false);
});
