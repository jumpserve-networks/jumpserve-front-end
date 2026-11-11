// These units await page selection before static rendering. Next Flight,
// hydration, OAuth and browser navigation are separate integration boundaries.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, mock, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';

globalThis.__routeReact = React;
const boundary = name => `export function ${name}(props){globalThis.__routeState.captures.push({name:'${name}',props});return globalThis.__routeReact.createElement('div',{'data-boundary':'${name}'});}`;
const replacements = {
  'server-only': 'export {};',
  'next/link': "export default function Link({prefetch, ...props}){return globalThis.__routeReact.createElement('a',props);}",
  'next/navigation': "export function notFound(){throw Object.assign(new Error('Synthetic notFound'),{code:'NEXT_NOT_FOUND'});}export function permanentRedirect(url){throw Object.assign(new Error('Synthetic permanent redirect'),{code:'NEXT_REDIRECT',url});}",
  '@/lib/supabase/server': 'export async function createClient(){return globalThis.__routeState.client;}',
  '@/lib/auth': "export async function getGoogleUser(){return globalThis.__routeState.user;}export async function requireGoogleUser(path){globalThis.__routeState.authPaths.push(path);if(globalThis.__routeState.authError)throw globalThis.__routeState.authError;return globalThis.__routeState.user;}",
  '@/app/components/auth-button': boundary('AuthButton'),
  '@/app/components/profile-editor': boundary('ProfileEditor'),
  '@/app/components/benchmark-tabs': boundary('BenchmarkTabs'),
  '@/app/components/test-lookup-home': boundary('TestLookupHome'),
  '@/app/components/benchmark-run-status': boundary('BenchmarkRunStatus'),
  '@/app/components/chat-panel': boundary('ChatPanel'),
  '@/app/components/real-world-tests': boundary('RealWorldTests'),
  '@/app/components/real-world-test-detail': boundary('RealWorldTestDetail'),
  '@/app/components/real-world-reports': boundary('RealWorldReports'),
  '@/app/components/real-world-report': boundary('RealWorldReport'),
  '@/app/components/aggregate-graphs-panel': boundary('AggregateGraphsPanel'),
  '@/app/components/platform-updates': boundary('PlatformUpdates'),
  '@/lib/platform-updates-store': 'export async function readPlatform(client,id){globalThis.__routeState.platformReads.push({client,id});return globalThis.__routeState.platform;}',
  '@/lib/emulated-runs-data': 'export async function fetchAggregateDelayGraphData(){return globalThis.__routeState.studyData;}',
  ...Object.fromEntries([['delay','getStudyData'],['leo','getLeoData'],['http2','getHttp2Data'],['ipv6','getIPv6Data'],['reliable','getReliableData']].map(([kind,name])=>['@/lib/'+kind+'-study-server',`export async function ${name}(){return globalThis.__routeState.studyData;}`])),
  ...Object.fromEntries([['delay','StudyDashboard'],['leo','LeoDashboard'],['http2','Http2Dashboard'],['ipv6','IPv6Dashboard'],['reliable','ReliableDashboard']].map(([kind,name])=>['@/app/components/'+kind+'-study/dashboard',boundary(name)])),
  '@/app/components/research-workflow/assessments': boundary('Assessments'),
  '@/app/components/research-workflow/assessment-detail': boundary('AssessmentDetail'),
  '@/app/components/research-workflow/paper-assessment': "export function PaperAssessment({children}){return children;}",
  '@/app/components/research-workflow/paper-review': boundary('PaperReviewPanel'),
  '@/app/components/research-workflow/claim-designer': boundary('ClaimDesigner'),
  '@/app/components/research-workflow/design-claim': boundary('DesignClaim'),
  '@/app/components/research-workflow/workspace': ['PaperIntake', 'OwnerStudies', 'StudyWorkspace'].map(boundary).join('\n'),
  '@/app/components/research-ideas/idea-workspace': ['IdeaIntake', 'IdeaWorkspace'].map(boundary).join('\n'),
  '@/app/components/research-workflow/published-studies': boundary('PublishedStudy')+boundary('PublishedStudies'),
  '@/app/components/research-workflow/study-panel': 'export function studyView(value){globalThis.__routeState.views.push(value);return globalThis.__routeState.selectedView;}',
  '@/app/components/user-preferences': "export function LocalDateTime({value,fallback}){return globalThis.__routeReact.createElement('time',{dateTime:value},value??fallback);}",
};
const hook = registerHooks({resolve(specifier, context, next) {return Object.hasOwn(replacements, specifier) ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const paths = {
  home: 'app/page.tsx', module: 'app/(modules)/[moduleId]/page.tsx', login: 'app/login/page.tsx', profile: 'app/profile/page.tsx',
  prompts: 'app/prompts/page.tsx', prompt: 'app/prompts/[versionId]/page.tsx',
  lookup: 'app/(modules)/congestion-control-emulated/test-lookup/page.tsx', benchmark: 'app/(modules)/congestion-control-emulated/benchmarks/page.tsx', benchmarkRun: 'app/(modules)/congestion-control-emulated/benchmarks/[jobId]/page.tsx',
  assessments: 'app/(modules)/research-verification/assessments/page.tsx', assessment: 'app/(modules)/research-verification/assessment/[assessmentId]/page.tsx', review: 'app/(modules)/research-verification/new-assessment/[assessmentId]/page.tsx', newPaper: 'app/(modules)/research-verification/new-assessment/page.tsx',
  design: 'app/(modules)/research-verification/experiment-design/[studyId]/page.tsx', designClaim: 'app/(modules)/research-verification/design-claim/[studyId]/[claimId]/page.tsx', workspace: 'app/(modules)/research-verification/workspace/[studyId]/page.tsx', ideaEvidence: 'app/(modules)/research-ideas/workspace/[studyId]/page.tsx',
  newIdea: 'app/(modules)/research-ideas/new-idea/page.tsx', ideas: 'app/(modules)/research-ideas/workspace/page.tsx', idea: 'app/(modules)/research-ideas/ideas/[studyId]/page.tsx', publishedPaper: 'app/(modules)/research-verification/assessments/[assessmentId]/page.tsx', publishedIdea: 'app/(modules)/research-ideas/studies/[studyId]/page.tsx',
  oldAssessments: 'app/(modules)/research-verification/previous-assessments/page.tsx', oldWorkspace: 'app/(modules)/research-verification/workspace/page.tsx', oldNewStudy: 'app/(modules)/research-verification/new-study/page.tsx', oldQueue: 'app/(modules)/research-verification/experiment-queue/page.tsx',
  emulatedChat: 'app/(modules)/congestion-control-emulated/chat/page.tsx', realWorldChat: 'app/(modules)/congestion-control-real-world/chat/page.tsx', leoChat: 'app/(modules)/leo-emergency-failover/chat/page.tsx', http2Chat: 'app/(modules)/http2-compliance-study/chat/page.tsx', ipv6Chat: 'app/(modules)/ipv6-dns-study/chat/page.tsx', reliableChat: 'app/(modules)/reliable-sketch-study/chat/page.tsx',
  realLaunch: 'app/(modules)/congestion-control-real-world/run-a-test/page.tsx', realDetail: 'app/(modules)/congestion-control-real-world/run-a-test/[jobId]/page.tsx', realResults: 'app/(modules)/congestion-control-real-world/test-results/page.tsx', realReport: 'app/(modules)/congestion-control-real-world/test-results/[jobId]/page.tsx', aggregate: 'app/(modules)/congestion-control-emulated/aggregate-graphs/page.tsx',
  delayResults:'app/(modules)/propagation-delay-study/test-results/page.tsx',leoResults:'app/(modules)/leo-emergency-failover/test-results/page.tsx',http2Results:'app/(modules)/http2-compliance-study/test-results/page.tsx',ipv6Results:'app/(modules)/ipv6-dns-study/test-results/page.tsx',reliableResults:'app/(modules)/reliable-sketch-study/test-results/page.tsx',
  platform:'app/platform-updates/page.tsx',platformDetail:'app/platform-updates/[id]/page.tsx',legacyStudy:'app/(modules)/research-verification/studies/[studyId]/page.tsx',legacyResults:'app/(modules)/research-verification/test-results/page.tsx',ideaResults:'app/(modules)/research-ideas/test-results/page.tsx',paperMethods:'app/(modules)/research-verification/methods/page.tsx',ideaMethods:'app/(modules)/research-ideas/methods/page.tsx',
};
const pages = {};
for (const [name, path] of Object.entries(paths)) pages[name] = await import('../' + path);
const {TEST_MODULES} = await import('../lib/test-modules.ts');
const {PUBLIC_BENCHMARK_COLUMNS} = await import('../lib/benchmark-progress.ts');
const {PublicLandingPage} = await import('../app/components/public-landing-page.tsx');
hook.deregister();

const ID = '3705a384-081d-4d8c-b75d-7e576c149151';
const OTHER = '8f43d6a0-c5ed-4468-bc43-022cc775c093';
const BASE = '/research-verification';
let state, environment;
beforeEach(() => {
  environment = {...process.env}; process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL = 'https://catalog.example.test';
  state = {user: null, session: {access_token: 'synthetic-server-session'}, sessionError: null, captures: [], authPaths: [], queries: [], views: [], selectedView: 'protocol', row: null, rowError: null, prompt: null,studyData:null,platformReads:[],platform:{status:'unavailable',reason:'Original unavailable'}};
  state.client = {auth: {getUser: async () => ({data: {user: state.user}}), getSession: async () => ({data: {session: state.session}, error: state.sessionError})}, from(table) {
    const query = {table}; state.queries.push(query); return {select(columns) {query.columns = columns; return {eq(field, value) {Object.assign(query, {field, value}); return {maybeSingle: async () => ({data: state.row, error: state.rowError})};}};}};
  }};
  globalThis.__routeState = state;
  mock.method(globalThis, 'fetch', async (url, options) => {
    state.queries.push({url, options}); return new Response(JSON.stringify(url.endsWith('/' + ID) ? {version: 'prompt-catalog-v1', prompt: state.prompt} : {version: 'prompt-catalog-v1', prompts: state.prompt ? [state.prompt] : []}));
  });
});
afterEach(() => {mock.restoreAll(); for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key]; Object.assign(process.env, environment);});
const props = (params = {}, query = {}) => ({params: Promise.resolve(params), searchParams: Promise.resolve(query)});
const documentOf = element => new JSDOM(renderToStaticMarkup(element)).window.document;
const renderPage = async (name, options = props()) => documentOf(await pages[name].default(options));
const capture = name => state.captures.findLast(value => value.name === name)?.props;
const google = () => ({id: 'synthetic-google-owner', email: 'owner@example.test', app_metadata: {provider: 'google'}, identities: [{provider: 'google'}]});
const assertNotFound = action => assert.rejects(action, {code: 'NEXT_NOT_FOUND'});

test('real-world launch requires sign-in while result and job pages remain public',async()=>{
  let document=await renderPage('realLaunch');assert.equal(capture('RealWorldTests'),undefined);assert.ok(document.querySelector('a[href="/login?next=%2Fcongestion-control-real-world%2Frun-a-test"]'));assert.equal(state.authPaths.length,0);
  state.user=google();await renderPage('realLaunch');assert.ok(capture('RealWorldTests'));
  state.user=null;await renderPage('realDetail',props({jobId:ID}));assert.equal(capture('RealWorldTestDetail').jobId,ID);
  await renderPage('realReport',props({jobId:ID}));assert.equal(capture('RealWorldReport').jobId,ID);
  await renderPage('realResults');assert.ok(capture('RealWorldReports'));assert.deepEqual(state.authPaths,[]);
});

test('public study result pages distinguish missing registration from recorded data without requiring authentication',async()=>{
  for(const [name,component] of [['delayResults','StudyDashboard'],['leoResults','LeoDashboard'],['http2Results','Http2Dashboard'],['ipv6Results','IPv6Dashboard'],['reliableResults','ReliableDashboard']]){
    state.studyData=null;state.captures=[];const missing=await renderPage(name);assert.match(missing.body.textContent,/not been registered|unavailable/);assert.equal(capture(component),undefined);
    state.studyData={original:'synthetic retained data',zero:0};await renderPage(name);assert.equal(capture(component).data,state.studyData);
  }
  await renderPage('aggregate');assert.equal(capture('AggregateGraphsPanel').data,state.studyData);assert.deepEqual(state.authPaths,[]);
});

test('platform pages authenticate the exact task and keep unavailable data distinct from missing tasks',async()=>{
  await renderPage('platform');assert.deepEqual(state.authPaths,['/platform-updates']);assert.equal(capture('PlatformUpdates').initial,state.platform);assert.equal(state.platformReads.at(-1).client,state.client);
  await renderPage('platformDetail',props({id:ID}));assert.equal(capture('PlatformUpdates').taskId,ID);assert.equal(state.platformReads.at(-1).id,ID);
  state.platform={status:'available',data:{operator_id:'owner',operator_role:'owner',tasks:[{id:ID}]}};await renderPage('platform');await renderPage('platformDetail',props({id:ID}));assert.equal(capture('PlatformUpdates').initial,state.platform);
  state.platform.data.tasks=[];await assertNotFound(()=>pages.platformDetail.default(props({id:ID})));
  state.authPaths=[];await assertNotFound(()=>pages.platformDetail.default(props({id:'invalid'})));assert.deepEqual(state.authPaths,[]);
});

test('research result redirects preserve queries and methods explain frozen evidence boundaries',async()=>{
  await assert.rejects(pages.legacyStudy.default(props({studyId:ID},{view:'protocol'})),{code:'NEXT_REDIRECT',url:BASE+'/assessments/'+ID+'?view=protocol'});
  await assert.rejects(pages.legacyResults.default(props({},{name:'A & B'})),{code:'NEXT_REDIRECT',url:BASE+'/assessments?name=A+%26+B'});
  await renderPage('ideaResults');assert.equal(capture('PublishedStudies').kind,'idea');
  for(const name of ['paperMethods','ideaMethods']){const document=await renderPage(name);assert.match(document.body.textContent,/protocol/);assert.match(document.body.textContent,/evidence/);}
  assert.deepEqual(state.authPaths,[]);
});

test('module chat pages preserve validated result context through sign-in and prepare an editable question', async () => {
  state.user=google();
  const cases=[['emulatedChat','congestion-control-emulated','parentRunId','2352','parent test run #2352'],['realWorldChat','congestion-control-real-world','jobId',ID.toUpperCase(),'real-world test '+ID],['leoChat','leo-emergency-failover','country','tonga','Tonga'],['http2Chat','http2-compliance-study','configuration','Apache-2.4.63','Apache-2.4.63'],['ipv6Chat','ipv6-dns-study','configuration','retained_case-1','retained_case-1'],['reliableChat','reliable-sketch-study','configuration','retained_case-1','retained_case-1']];
  for(const [name,moduleId,field,value,expected] of cases){
    state.authPaths=[];state.captures=[];await renderPage(name,props({}, {[field]:value}));
    const normalized=field==='jobId'?value.toLowerCase():value;
    assert.deepEqual(state.authPaths,['/'+moduleId+'/chat?'+new URLSearchParams({[field]:normalized})]);
    assert.equal(capture('ChatPanel').userEmail,state.user.email);assert.ok(capture('ChatPanel').initialMessage.includes(expected));
    assert.equal(capture('ChatPanel').moduleId,name==='emulatedChat'?undefined:moduleId);
    assert.equal(capture('ChatPanel').autoSend,undefined);
  }
});

test('invalid array and missing chat result identifiers cannot become prompt context or login redirects', async () => {
  state.user=google();
  const cases=[['emulatedChat','congestion-control-emulated','parentRunId',['0','-1','9007199254740992','1&select=*']],['realWorldChat','congestion-control-real-world','jobId',['not-a-uuid',ID+'&select=*']],['leoChat','leo-emergency-failover','country',['unknown','Tonga']],['http2Chat','http2-compliance-study','configuration',['../private','x'.repeat(101)]],['ipv6Chat','ipv6-dns-study','configuration',['../private','x'.repeat(101)]],['reliableChat','reliable-sketch-study','configuration',['../private','x'.repeat(101)]]];
  for(const [name,moduleId,field,values] of cases)for(const value of [undefined,['retained'],...values]){
    state.authPaths=[];state.captures=[];await renderPage(name,props({}, {[field]:value}));
    assert.deepEqual(state.authPaths,['/'+moduleId+'/chat']);assert.equal(capture('ChatPanel').initialMessage,'');
  }
});

test('failed chat authentication stops rendering before any chat or model boundary is reached', async () => {
  state.authError=new Error('Synthetic sign-in required');
  for(const name of ['emulatedChat','realWorldChat','leoChat','http2Chat','ipv6Chat','reliableChat'])await assert.rejects(pages[name].default(props()),/sign-in required/);
  assert.equal(capture('ChatPanel'),undefined);
});

test('home shows both research pathways and only resumes a safe module deep link for a verified Google user', async () => {
  for (const user of [null, {id: 'email-only', app_metadata: {provider: 'email'}, identities: []}, {...google(), is_anonymous: true}]) {
    state.user = user; const document = await renderPage('home', props({}, {next: '/research-verification/assessment/' + ID}));
    assert.match(document.body.textContent, /Choose your research path/); assert.equal(document.querySelector('[aria-label="Requested page"]'), null);
    assert.equal([...document.querySelectorAll('a')].find(a => a.textContent === 'View assessments').getAttribute('href'), BASE + '/assessments');
  }
  state.user = google(); let document = await renderPage('home', props({}, {next: '/research-verification/assessment/' + ID + '?job=' + OTHER}));
  assert.equal([...document.querySelectorAll('a')].find(a => a.textContent.includes('Continue to requested page')).getAttribute('href'), BASE + '/assessment/' + ID + '?job=' + OTHER);
  for (const next of [undefined, ['https://untrusted.example.test'], 'https://untrusted.example.test', '//untrusted.example.test', '/not-a-module']) {
    document = await renderPage('home', props({}, {next})); assert.equal(document.querySelector('[aria-label="Requested page"]'), null);
  }
  assert.equal(documentOf(React.createElement(PublicLandingPage)).querySelector('[aria-label="Requested page"]'), null);
});

test('module pages expose only available modules and retain canonical tool links', async () => {
  for (const entry of TEST_MODULES) {
    const metadata = await pages.module.generateMetadata(props({moduleId: entry.id})); assert.equal(metadata.title, entry.name);
    if (entry.status !== 'available') {await assertNotFound(() => pages.module.default(props({moduleId: entry.id}))); continue;}
    const document = await renderPage('module', props({moduleId: entry.id})); assert.equal(document.querySelector('h1').textContent.trim(), entry.name);
    assert.deepEqual([...document.querySelectorAll('nav a')].map(a => a.getAttribute('href')), entry.sections.map(section => section.href));
    if (entry.id === 'research-verification') assert.doesNotMatch(document.body.textContent, /Test module/);
    else assert.match(document.body.textContent, /Test module/);
  }
  assert.deepEqual(await pages.module.generateMetadata(props({moduleId: 'unknown'})), {title: 'Module not found', description: undefined});
  await assertNotFound(() => pages.module.default(props({moduleId: 'unknown'})));
});

test('login preserves a plain-text provider error and treats arrays as the first recorded message', async () => {
  for (const error of [undefined, '', [], ['First recorded error', 'Later error'], '<script>untrusted()</script>']) {
    const document = await renderPage('login', props({}, {error})); const expected = Array.isArray(error) ? error[0] : error;
    assert.equal(document.querySelector('[role="alert"]')?.textContent.trim() ?? null, expected || null); assert.equal(document.querySelector('script'), null);
    assert.equal(capture('AuthButton').placement, 'inline');
  }
});

test('profile and paper or idea intake require the exact resumable Google action before rendering controls', async () => {
  const entries = [['profile', props(), '/profile', 'ProfileEditor'], ['newPaper', props({}, {name: 'A & B', mine: '1'}), BASE + '/new-assessment?name=A+%26+B&mine=1', 'PaperIntake'], ['newIdea', props({}, {topic: 'Ω'}), '/research-ideas/new-idea?topic=%CE%A9', 'IdeaIntake'], ['ideas', props(), '/research-ideas/workspace', 'OwnerStudies']];
  for (const [name, options, path, control] of entries) {
    state.authPaths.length = 0; state.captures.length = 0; const document = await renderPage(name, options);
    assert.deepEqual(state.authPaths, [path]); assert.ok(document.querySelector(`[data-boundary="${control}"]`));
    state.authError = Object.assign(new Error('Synthetic required login'), {code: 'AUTH_REQUIRED'}); state.captures.length = 0;
    await assert.rejects(pages[name].default(options), {code: 'AUTH_REQUIRED'}); assert.equal(state.captures.length, 0); state.authError = null;
  }
  assert.equal(capture('OwnerStudies')?.kind, undefined); // Denied page rendered no controls.
});

test('assessment list passes safe cursor and trimmed name with table as the default view', async () => {
  for (const [query, expected] of [[{}, {before: undefined, mine: false, name: '', view: 'table'}], [{before: ['first', 'second'], mine: ['1'], name: ['unexpected'], view: ['card']}, {before: 'invalid', mine: false, name: '', view: 'table'}], [{before: 'recorded-cursor', mine: '1', name: '  Example Ω  ', view: 'card'}, {before: 'recorded-cursor', mine: true, name: 'Example Ω', view: 'card'}]]) {
    await renderPage('assessments', props({}, query)); assert.deepEqual(capture('Assessments'), expected);
  }
  assert.deepEqual(state.authPaths, []);
});

test('public assessment detail validates every queue identity and gates gap work before rendering', async () => {
  await renderPage('assessment', props({assessmentId: ID}, {job: OTHER})); assert.deepEqual(capture('AssessmentDetail'), {assessmentId: ID, jobId: OTHER, gapId: undefined, launchId: undefined}); assert.deepEqual(state.authPaths, []);
  await renderPage('assessment', props({assessmentId: ID}, {gap: OTHER, run: ID})); assert.deepEqual(state.authPaths, [BASE + '/assessment/' + ID + '?gap=' + OTHER + '&run=' + ID]);
  for (const [id, query] of [['invalid', {}], [ID, {job: 'invalid'}], [ID, {gap: ['invalid']}], [ID, {run: 'invalid'}], [ID, {run: OTHER}]]) {
    state.authPaths.length = 0; await assertNotFound(() => pages.assessment.default(props({assessmentId: id}, query))); assert.deepEqual(state.authPaths, []);
  }
});

test('paper review and experiment design validate frozen identities before requesting authorization', async () => {
  for (const [name, params, path, control] of [['review', {assessmentId: ID}, BASE + '/new-assessment/' + ID, 'PaperReviewPanel'], ['design', {studyId: ID}, BASE + '/experiment-design/' + ID, 'ClaimDesigner'], ['designClaim', {studyId: ID, claimId: OTHER}, BASE + '/design-claim/' + ID + '/' + OTHER, 'DesignClaim']]) {
    state.authPaths.length = 0; await renderPage(name, props(params)); assert.deepEqual(state.authPaths, [path]); assert.ok(capture(control));
    for (const field of Object.keys(params)) {
      state.authPaths.length = 0; await assertNotFound(() => pages[name].default(props({...params, [field]: 'invalid'}))); assert.deepEqual(state.authPaths, []);
    }
  }
});

test('workspace routes retain the selected view and reject malformed UUIDs before authentication', async () => {
  for (const [name, root, kind] of [['workspace', BASE, undefined], ['ideaEvidence', '/research-ideas', 'idea']]) {
    for (const view of [undefined, 'untrusted-view']) {
      state.views.length = 0; state.authPaths.length = 0; await renderPage(name, props({studyId: ID}, {view}));
      assert.deepEqual(state.views, [view]); assert.deepEqual(state.authPaths, [root + '/workspace/' + ID + (view ? '?view=protocol' : '')]);
      assert.equal(capture('StudyWorkspace').studyId, ID); assert.equal(capture('StudyWorkspace').view, 'protocol'); assert.equal(capture('StudyWorkspace').kind, kind);
    }
    for (const invalid of ['invalid', '-'.repeat(36), 'a'.repeat(36)]) {
      state.authPaths.length = 0; await assertNotFound(() => pages[name].default(props({studyId: invalid}))); assert.deepEqual(state.authPaths, []);
    }
  }
});

test('idea and published assessment wrappers keep their module identity and unchanged query promises', async () => {
  const options = props({studyId: ID}, {view: 'sources'}); await renderPage('idea', options);
  assert.equal(capture('IdeaWorkspace').studyId, ID); assert.equal(state.authPaths.at(-1), '/research-ideas/ideas/' + ID + '?view=sources');
  await renderPage('publishedPaper', props({assessmentId: ID}, {view: 'protocol'})); let published = capture('PublishedStudy'); assert.equal(published.kind, 'paper'); assert.deepEqual(await published.params, {studyId: ID}); assert.deepEqual(await published.searchParams, {view: 'protocol'});
  await renderPage('publishedIdea', options); published = capture('PublishedStudy'); assert.equal(published.kind, 'idea'); assert.equal(published.params, options.params); assert.equal(published.searchParams, options.searchParams);
});

test('legacy routes preserve ordinary query parameters and queue job identities in their canonical redirect', async () => {
  for (const [name, expected] of [['oldAssessments', BASE + '/assessments?name=A+%26+B'], ['oldWorkspace', BASE + '/assessments?name=A+%26+B&mine=1'], ['oldNewStudy', BASE + '/new-assessment?name=A+%26+B']]) {
    await assert.rejects(pages[name].default(props({}, {name: 'A & B'})), {code: 'NEXT_REDIRECT', url: expected});
  }
  const cases = [[{}, BASE + '/assessments?mine=1'], [{study: ID}, BASE + '/assessment/' + ID + '#experiment-queue'], [{assessment: ID, job: OTHER, view: 'private'}, BASE + '/assessment/' + ID + '?job=' + OTHER + '#job-' + OTHER], [{sourceAssessment: ID, gap: OTHER, run: ID}, BASE + '/assessment/' + ID + '?gap=' + OTHER + '&run=' + ID + '#experiment-queue']];
  for (const [query, url] of cases) await assert.rejects(pages.oldQueue.default(props({}, query)), {code: 'NEXT_REDIRECT', url});
  for (const query of [{assessment: 'invalid'}, {study: ID, assessment: OTHER}, {assessment: ID, sourceAssessment: OTHER, gap: ID}, {job: ID}, {sourceAssessment: ID}, {gap: OTHER}, {assessment: ID, run: OTHER}, {assessment: ID, view: 'unexpected'}, {assessment: [ID, OTHER]}]) await assertNotFound(() => pages.oldQueue.default(props({}, query)));
});

test('benchmark pages use an explicit public projection and distinguish invalid missing and failed reads', async () => {
  for (const [page, expected] of [[undefined, 1], [[], 1], [['3', '9'], 3], ['0', 1], ['invalid', 1], ['2', 2]]) {
    await renderPage('lookup', props({}, {page})); assert.equal(capture('TestLookupHome').initialPageNumber, expected);
  }
  for (const user of [null, google()]) {
    state.user = user; const document = await renderPage('benchmark'); assert.equal(capture('BenchmarkTabs').userEmail, user?.email);
    assert.equal(document.querySelector('a').getAttribute('href'), '/congestion-control-emulated');
    state.row = {id: ID, status: 'running', requested_instances: 0}; await renderPage('benchmarkRun', props({jobId: ID}));
    assert.equal(capture('BenchmarkRunStatus').initialJob, state.row); assert.equal(capture('BenchmarkRunStatus').canManage, Boolean(user));
    assert.deepEqual(state.queries.at(-1), {table: 'benchmark_jobs', columns: PUBLIC_BENCHMARK_COLUMNS, field: 'id', value: ID});
    assert.doesNotMatch(PUBLIC_BENCHMARK_COLUMNS, /requester_email/);
  }
  state.queries.length = 0; await assertNotFound(() => pages.benchmarkRun.default(props({jobId: 'invalid'}))); assert.deepEqual(state.queries, []);
  state.row = null; await assertNotFound(() => pages.benchmarkRun.default(props({jobId: ID})));
  state.rowError = {message: 'Private SQL diagnostic'}; await assert.rejects(pages.benchmarkRun.default(props({jobId: ID})), /^Error: Unable to load benchmark status\. Please try again\.$/);
});

test('prompt pages require a verified user and server session before displaying stored text and source hashes', async () => {
  state.prompt = {id: ID, module_id: 'research-autonomy', version: 'retained-v1', content_sha256: 'f'.repeat(64), created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-02T00:00:00Z', published_at: '2026-11-02T00:00:00Z', active: true, system_prompt: '<script>source is data</script>', research_context: '{"zero":0,"missing":null}'};
  let document = await renderPage('prompts'); assert.deepEqual(state.authPaths, ['/prompts']); assert.match(document.body.textContent, /retained-v1/); assert.equal(document.querySelector('article a').getAttribute('href'), '/prompts/' + ID);
  document = await renderPage('prompt', props({versionId: ID})); assert.equal(document.querySelector('h1').textContent, 'retained-v1'); assert.match(document.body.textContent, /Assessment autonomy/); assert.match(document.body.textContent, /f{64}/);
  assert.equal(document.querySelector('script'), null); assert.equal(document.querySelectorAll('pre')[0].textContent, '<script>source is data</script>'); assert.equal(document.querySelectorAll('pre')[1].textContent, '{\n  "zero": 0,\n  "missing": null\n}'); assert.equal(document.querySelectorAll('time').length, 2);
  assert.equal(state.queries.at(-1).options.headers.Authorization, 'Bearer synthetic-server-session'); assert.equal(state.queries.at(-1).options.cache, 'no-store');
  state.prompt = {...state.prompt, active: false, published_at: null}; document = await renderPage('prompt', props({versionId: ID})); assert.match(document.body.textContent, /Draft/); assert.match(document.body.textContent, /Not published/);
  state.authPaths.length = 0; state.queries.length = 0; await assertNotFound(() => pages.prompt.default(props({versionId: 'invalid'}))); assert.deepEqual(state.authPaths, []); assert.deepEqual(state.queries, []);
});

test('prompt failures retain useful errors and never show a fabricated empty successful catalog', async () => {
  for (const [session, sessionError] of [[null, null], [{}, null], [{access_token: 'synthetic-session'}, {message: 'Session rejected'}]]) {
    state.session = session; state.sessionError = sessionError; const document = await renderPage('prompts'); assert.match(document.querySelector('[role="alert"]').textContent, /Sign in again/);
  }
  state.session = {access_token: 'synthetic-session'}; state.sessionError = null;
  for (const failure of [new Error('Synthetic retrieval unavailable'), 'Unstructured original failure']) {
    globalThis.fetch.mock.mockImplementation(async () => {throw failure;});
    let document = await renderPage('prompts'); assert.match(document.querySelector('[role="alert"]').textContent, failure instanceof Error ? /Synthetic retrieval unavailable/ : /Prompts are unavailable/);
    document = await renderPage('prompt', props({versionId: ID})); assert.match(document.querySelector('[role="alert"]').textContent, failure instanceof Error ? /Synthetic retrieval unavailable/ : /Prompt is unavailable/);
    assert.equal([...document.querySelectorAll('a')].find(a => a.textContent === 'Try again').getAttribute('href'), '/prompts/' + ID);
  }
});
