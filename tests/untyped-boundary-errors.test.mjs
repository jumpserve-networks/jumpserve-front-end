import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const replacements={
 '@/lib/research-workflow':'export function researchApiBase(){throw globalThis.__boundaryFailure;}',
 '@/lib/browser-auth':'export async function requireAccessToken(){throw new Error("Authentication must not follow a failed configuration check");}',
 '@/lib/idea-review-sources':'export function reviewSources(){throw globalThis.__boundaryFailure;}',
};
const hook=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {ideaModelRequest,IdeaRequestError}=await import('../lib/research-idea-api.ts');
const {IdeaReviewSources}=await import('../app/components/research-ideas/idea-review-sources.tsx');
hook.deregister();

test('configuration adapter failures cannot admit an AI request even without an Error instance',async()=>{
 for(const failure of [new Error('Original configuration failure'),null]){globalThis.__boundaryFailure=failure;await assert.rejects(ideaModelRequest({}),error=>error instanceof IdeaRequestError&&!error.uncertain&&error.message===(failure?.message??'AI configuration or sign-in could not be verified.'));}
 delete globalThis.__boundaryFailure;
});
test('source declaration failures remain explicit without exposing an unstructured thrown value',()=>{
 for(const failure of [new Error('Original source validation failure'),{private:'unstructured source context'}]){globalThis.__boundaryFailure=failure;const markup=renderToStaticMarkup(React.createElement(IdeaReviewSources,{run:{}}));assert.match(markup,/role="alert"/);assert.ok(markup.includes(failure.message??'The recorded declarations could not be verified.'));assert.ok(!markup.includes('unstructured source context'));}
 delete globalThis.__boundaryFailure;
});
