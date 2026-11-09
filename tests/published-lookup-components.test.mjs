import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
globalThis.__publishedReact=React;
const boundary=name=>`export function ${name}(props){globalThis.__publishedCaptures.push({name:${JSON.stringify(name)},props});return globalThis.__publishedReact.createElement('section',{'data-child':${JSON.stringify(name)}});}`;
const replacements={
 'next/link':"export default function Link(props){return globalThis.__publishedReact.createElement('a',props);}",
 'next/navigation':"export function permanentRedirect(url){throw Object.assign(new Error('Synthetic redirect'),{url});}",
 '@/app/components/parent-run-index':boundary('ParentRunIndex'),
 '@/app/components/research-workflow/header':boundary('ResearchHeader'),
 '@/app/components/research-workflow/study-panel':boundary('StudyPanel')+"export const studyView=value=>value??'overview';",
 '@/lib/research-workflow-server':'export const getResearchStudies=async()=>globalThis.__publishedStudies;export const getResearchSnapshot=async()=>globalThis.__publishedSnapshot;',
 '@/lib/emulated-runs-data':'export const fetchParentRunsForIndexPage=async options=>{globalThis.__publishedPageOptions=options;return globalThis.__publishedParentPage;};',
};
const hooks=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {PublishedStudy,PublishedStudies}=await import('../app/components/research-workflow/published-studies.tsx');const {TestLookupHome}=await import('../app/components/test-lookup-home.tsx');hooks.deregister();
const ID='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{globalThis.__publishedCaptures=[];globalThis.__publishedParentPage={parentRuns:[],total:0};globalThis.__publishedStudies={status:'available',data:{studies:[],has_more:false}};globalThis.__publishedSnapshot={status:'unavailable',reason:'Original public snapshot unavailable'};});
const documentOf=element=>new JSDOM(renderToStaticMarkup(element)).window.document;
test('lookup empty state links to its own module and nonempty pages retain exact server pagination',async()=>{
 let document=documentOf(await TestLookupHome({}));assert.match(document.body.textContent,/No parent run data found/);assert.equal(document.querySelector('a').getAttribute('href'),'/congestion-control-emulated');assert.deepEqual(globalThis.__publishedPageOptions,{page:1,pageSize:10});
 globalThis.__publishedParentPage={parentRuns:[{id:0}],total:1};document=documentOf(await TestLookupHome({initialPageNumber:3}));assert.ok(document.querySelector('[data-child="ParentRunIndex"]'));assert.equal(globalThis.__publishedCaptures.at(-1).props.initialPage,globalThis.__publishedParentPage);assert.deepEqual(globalThis.__publishedPageOptions,{page:3,pageSize:10});
});
test('published paper and idea listings preserve pathway filters missingness and noncensus limits',async()=>{
 for(const kind of ['paper','idea']){globalThis.__publishedStudies.data.has_more=false;let document=documentOf(await PublishedStudies({kind}));assert.match(document.body.textContent,kind==='paper'?/No published assessments yet/:/No published idea experiments yet/);globalThis.__publishedStudies.data.has_more=true;document=documentOf(await PublishedStudies({kind}));assert.match(document.body.textContent,/No matching assessments in the available list/);assert.match(document.body.textContent,/not a census/);}
 globalThis.__publishedStudies={status:'unavailable',reason:'Original catalogue unavailable'};const document=documentOf(await PublishedStudies({kind:'paper'}));assert.match(document.body.textContent,/Original catalogue unavailable/);
});
test('published listings retain original titles scopes and gap links within each pathway',async()=>{
 globalThis.__publishedStudies={status:'available',data:{has_more:false,studies:[{id:ID,title:'Original paper',study_kind:'paper',domain:'Networking',scope:'Original recorded scope'},{id:'idea-id',title:'Original hypothesis',study_kind:'idea',domain:'Methods',scope:'Unpublished proposal'}]}};
 for(const kind of ['paper','idea']){const document=documentOf(await PublishedStudies({kind}));assert.match(document.body.textContent,kind==='paper'?/Original paper/:/Original hypothesis/);assert.equal(document.querySelectorAll('article').length,1);assert.ok(document.querySelector('article a[href$="?view=gaps"]'));}
});
test('published detail shows only available records and preserves cross-pathway query redirects',async()=>{
 const props={kind:'paper',params:Promise.resolve({studyId:ID}),searchParams:Promise.resolve({view:'gaps'})};let document=documentOf(await PublishedStudy(props));assert.match(document.body.textContent,/Original public snapshot unavailable/);
 globalThis.__publishedSnapshot={status:'available',data:{study:{id:ID,title:'Original paper',study_kind:'paper'},records:{}}};document=documentOf(await PublishedStudy(props));assert.equal(document.querySelectorAll('a').length,2);assert.ok(document.querySelector('a[href$="?format=csv"]'));assert.equal(globalThis.__publishedCaptures.at(-1).props.view,'gaps');
 documentOf(await PublishedStudy({...props,searchParams:Promise.resolve({view:['gaps','runs']})}));assert.equal(globalThis.__publishedCaptures.at(-1).props.view,'overview');
 globalThis.__publishedSnapshot.data.study.study_kind='idea';await assert.rejects(PublishedStudy({...props,searchParams:Promise.resolve({view:['gaps','runs'],value:'original'})}),error=>error.url.startsWith('/research-ideas/studies/'+ID+'?')&&error.url.includes('view=gaps')&&error.url.includes('value=original'));
});
