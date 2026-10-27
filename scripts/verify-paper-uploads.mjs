// Local React -> actual browser request adapter -> HTTP/storage fixture.
// Auth, extraction and persistence are synthetic. No real models, uploads or cloud writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
assert.equal(process.argv.length, 2, 'Fixed local campaign; no arbitrary targets.');
const require = createRequire(import.meta.url), { build } = require('../../jumpserve-infra/node_modules/esbuild');
const directory = '.test-artifacts/paper-uploads/' + new Date().toISOString().replaceAll(':', '-');
await mkdir(directory, { recursive: true });
const ownerA = '10000000-0000-4000-8000-000000000001', ownerB = '10000000-0000-4000-8000-000000000002';
const source = '20000000-0000-4000-8000-000000000001', claim = '30000000-0000-4000-8000-000000000001';
const records = new Map(), requests = [], gates = new Map();
const report = { protocol: 'paper-background-upload-development-v1', started_at: new Date().toISOString(),
  actual_react_components: true, actual_browser_request_adapter: true, synthetic_auth: true,
  synthetic_storage_and_extraction: true, next_navigation_stubbed: true, checks: [], page_errors: [],
  blocked_external_requests: [], remote_writes: 0, model_calls: 0, measured_charges_usd: null,
  reviewer: { identity: 'Primary Codex AI implementer', type: 'AI', independent: false },
  gaps: ['Legitimate Google session and production deployment are not exercised.', 'The existing backend workers/database are represented by a controlled HTTP fixture.'] };
let browser, bundle, css = '', origin, failureMode = false, legacyStatusMode = false;
const queueFailures = new Set();
const pdf = name => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nExplicit browser software fixture.\n%%EOF') });
function review(row) { return { version: 'research-paper-review-v1', id: row.id, status: row.paper_review_status,
  revision: 1, title: row.title, domain: 'Software verification', progress: 'Explicit fixture extraction', reason: null,
  can_start: row.paper_review_status === 'ready', claims: [{ id: claim, description: 'Explicit fixture: latency is 10 ms.', claim_type: 'numerical', location: 'PDF page 1', source_id: source }],
  organization: { version: 'paper-review-selection-v1', status: 'ready', central_claims: [], testable_findings: [{ claim_id: claim, label: 'Latency under fixed conditions' }], candidate_count: 1, cursor: 1 },
  coverage: {}, confirmation: row.confirmation ?? null, limits: { max_spend_cents: 10000, committed_cents: 50, deadline_at: new Date(Date.now() + 86400000).toISOString() } }; }
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const owner = req.headers.authorization?.replace('Bearer fixture:', '') ?? req.headers.cookie?.match(/fixture_owner=([^;]+)/)?.[1];
    const chunks = []; for await (const chunk of req) { chunks.push(chunk); if (chunks.reduce((n, c) => n + c.length, 0) > 10000000) throw Error('Fixture request too large'); }
    const raw = Buffer.concat(chunks), body = raw.length && !url.pathname.startsWith('/storage/') ? JSON.parse(raw) : {};
    requests.push({ path: url.pathname, method: req.method, owner, action: body.action, id: body.request_id, authorization_present: !!req.headers.authorization, cookie_present: !!req.headers.cookie });
    const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    if (url.pathname === '/bundle.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(bundle); return; }
    if (url.pathname === '/bundle.css') { res.writeHead(200, { 'Content-Type': 'text/css' }); res.end(css); return; }
    if (url.pathname === '/api/profile') return json({ profile: { id: owner, first_name: 'Fixture', last_name: 'Researcher', timezone: 'America/New_York' } });
    if (url.pathname === '/research/capabilities') return json({ autonomy: { version: 'research-autonomy-v3', enabled: true }, paper_uploads: { version: 'research-paper-upload-v2', review_version: 'research-paper-review-v1', maximum_bytes: 10000000, confirmation_required: true } });
    if (url.pathname === '/research/studies') {
      if (failureMode) return json({ error: 'Explicit fixture status outage' }, 503);
      return json({ access: 'owner-drafts', ...(legacyStatusMode ? {} : { assessment_status_version: 'research-assessment-status-v1' }), studies: [...records.values()].filter(r => r.owner === owner && r.paper_review_status).map(r => ({ id: r.id, title: r.title, authors: r.authors ?? null, domain: 'Networking', scope: 'Explicit browser software fixture', study_kind: 'paper', paper_review_status: r.paper_review_status, ...(legacyStatusMode ? {} : { assessment_status: r.assessment_status ?? null }) })) });
    }
    if (/^\/research\/studies\/[a-f0-9-]+\/queue$/.test(url.pathname)) {
      assert.equal(req.method, 'GET'); assert.equal(url.search, '?public=1&diagnostics=1');
      assert.equal(req.headers.authorization, undefined); assert.equal(req.headers.cookie, undefined);
      const id = url.pathname.split('/')[3], row = records.get(id);
      if (!row) return json({ error: 'Paper not found' }, 404);
      if (queueFailures.has(id)) return json({ error: 'PRIVATE-CANARY: deliberately hidden server details' }, 503);
      const summary = row.assessment_status, stamp = summary?.updated_at ?? '2026-10-25T18:00:00Z';
      const tasks = summary ? [{ id: '70000000-0000-4000-8000-000000000000', study_id: id, claim_id: null, claim_title: null, stage: 'intake', status: 'resolved', label: null, attempts: 1, reason: 'Preparation recorded', created_at: stamp, updated_at: stamp }] : [];
      if (summary) {
        const c = summary.counts;
        const groups = [[c.reproduced, 'resolved', 'reproduced'], [c.discrepant, 'resolved', 'discrepant'], [c.finished - c.reproduced - c.discrepant, 'finished', 'inconclusive'], [c.blocked, 'blocked', 'untested'], [c.running, 'running', 'untested'], [c.queued, 'queued', 'untested'], [c.waiting, 'waiting', 'inconclusive']];
        for (const [count, status, label] of groups) for (let index = 0; index < count; index++) {
          const suffix = String(tasks.length).padStart(12, '0');
          tasks.push({ id: '70000000-0000-4000-8000-' + suffix, study_id: id, claim_id: '80000000-0000-4000-8000-' + suffix, claim_title: 'Explicit fixture claim', stage: 'planning', status, label, attempts: 1, reason: 'Recorded fixture status', created_at: stamp, updated_at: stamp });
        }
        assert.equal(tasks.length - 1, c.total);
      }
      return json({ version: 'research-public-queue-v1', access: 'public-read-only', study: { id, title: row.title }, jobs: [], coverage: { jobs: 0 }, workers_enabled: true, limitations: 'Explicit read-only fixture', autonomy: {
        version: 'research-autonomy-v3', access: 'public-read-only', enabled: true, defaults: { maximum_spend_usd: 100, elapsed_days: 7, attempts_per_claim: null },
        workflows: summary ? [{ study_id: id, max_spend_cents: 10000, max_attempts: null, committed_cents: 0, status: summary.status, reason: 'Recorded fixture status', created_at: stamp, updated_at: stamp, deadline_at: stamp }] : [],
        tasks, coverage: { workflows: summary ? 1 : 0, tasks: tasks.length },
      } });
    }
    if (url.pathname === '/research/papers') return json({version:'research-paper-catalog-v1',access:'public-read-only',papers:[...records.values()].filter(r=>r.paper_review_status).slice(0,10).map(r=>({id:r.id,title:r.title,authors:r.authors??null,created_at:'2026-10-25T18:00:00Z',workflow_status:r.assessment_status?.status??null,published:false})),coverage:{papers:[...records.values()].filter(r=>r.paper_review_status).length},next_cursor:null});
    if (/^\/research\/papers\/[a-f0-9-]+\/title$/.test(url.pathname)) {
      const row=records.get(url.pathname.split('/')[3]);
      return row?json({version:'research-paper-catalog-v1',access:'public-read-only',id:row.id,title:row.title,authors:row.authors??null}):json({error:'Paper not found'},404);
    }
    if (url.pathname === '/research/paper-uploads') {
      const id = body.request_id;
      if (body.action === 'reserve') {
        if (!records.has(id)) records.set(id, { ...body, id, owner, title: 'Extracted ' + body.filename.replace(/\.pdf$/i, '') });
        const row = records.get(id); assert.equal(row.owner, owner);
        return json({ version: 'research-paper-upload-v2', id, status: 'pending', bucket: 'research-paper-uploads', path: id + '/' + body.sha256, token: 'explicit-local-scoped-upload', sha256: body.sha256, byte_count: body.byte_count, maximum_bytes: 10000000 });
      }
      const row = records.get(id); if (!row || row.owner !== owner) return json({ error: 'Owner paper not found' }, 404);
      if (body.action === 'prepare') { assert.ok(row.bytes_verified); row.paper_review_status ??= 'preparing'; return json({ id, review_version: 'research-paper-review-v1', status: row.paper_review_status }); }
      if (body.action === 'review') return json(review(row));
      if (body.action === 'confirm') {
        assert.equal(row.paper_review_status, 'ready'); assert.deepEqual(body.selection, { central_claims: [], testable_findings: [claim] }); row.paper_review_status = 'confirmed'; row.confirmation = { title: body.title, domain: body.domain, claim_ids: body.claim_ids, selection: body.selection };
        row.assessment_status = { status: 'running', updated_at: new Date().toISOString(), counts: { total: body.claim_ids.length, finished: 0, reproduced: 0, discrepant: 0, blocked: 0, running: 1, queued: 0, waiting: 0 } };
        return json(review(row));
      }
      return json({ error: 'Unsupported action' }, 400);
    }
    if (url.pathname.startsWith('/storage/')) {
      const id = url.pathname.split('/')[2], row = records.get(id); assert.equal(row.owner, owner);
      if (gates.has(row.filename)) await gates.get(row.filename);
      assert.equal(raw.length, row.byte_count); assert.equal(createHash('sha256').update(raw).digest('hex'), row.sha256); row.bytes_verified = true;
      return json({ stored: true });
    }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (url.pathname.startsWith('/_next/')) { res.writeHead(204); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><title>Local paper upload fixture</title><style>body{font-family:Arial,sans-serif;padding:16px}main{max-width:900px;margin:24px auto}nav{display:flex;gap:16px;flex-wrap:wrap}</style></head><body><div id="root"></div><script>window.fixtureOwner=${JSON.stringify(ownerA)}</script><script src="/bundle.js"></script></body></html>`);
  } catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
});
async function check(name, run) {
  try { const evidence = await run(); report.checks.push({ name, passed: true, evidence }); console.log('PASS ' + name); }
  catch (error) { report.checks.push({ name, passed: false, error: error.message }); throw error; }
}
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  const bundled = await build({ stdin: { contents: `import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import Link from 'next/link';import {UserPreferencesProvider} from './app/components/user-preferences';import {PaperUploadsProvider} from './app/components/research-workflow/paper-uploads-provider';import {PaperIntake,OwnerStudies} from './app/components/research-workflow/workspace';import {PreviousAssessments} from './app/components/research-workflow/previous-assessments';import {PaperReviewPanel} from './app/components/research-workflow/paper-review';function App(){const [path,setPath]=useState(location.pathname);useEffect(()=>{const changed=()=>setPath(location.pathname);addEventListener('popstate',changed);return()=>removeEventListener('popstate',changed)},[]);return <><nav><Link href='/research-verification/new-assessment'>Upload papers</Link><Link href='/'>Browse home</Link><Link href='/research-ideas'>Browse ideas</Link><Link href='/research-verification/my-assessments'>My assessments</Link><Link href='/research-verification/previous-assessments'>Previous assessments</Link></nav><main>{path==='/research-verification/my-assessments'?<OwnerStudies/>:path==='/research-verification/previous-assessments'?<PreviousAssessments/>:path==='/research-verification/new-assessment'?<PaperIntake/>:path.startsWith('/research-verification/new-assessment/')?<PaperReviewPanel assessmentId={path.split('/').pop()}/>:<h1>Browsing JumpServe</h1>}</main></>;}createRoot(document.getElementById('root')).render(<React.StrictMode><UserPreferencesProvider><PaperUploadsProvider><App/></PaperUploadsProvider></UserPreferencesProvider></React.StrictMode>);`, resolveDir: process.cwd(), sourcefile: 'paper-uploads-browser.tsx', loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL': JSON.stringify(origin) },
    plugins: [{ name: 'synthetic-auth-storage-and-next-navigation', setup(p) {
      p.onResolve({ filter: /^(@\/lib\/supabase\/client|next\/(link|navigation))$/ }, a => ({ path: a.path, namespace: 'fixture' }));
      p.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ loader: 'js', resolveDir: process.cwd(), contents: a.path === 'next/link'
        ? `import React from 'react';export default function Link({href,prefetch:ignored,onClick,...props}){return React.createElement('a',{...props,href,onClick(e){onClick?.(e);if(!e.defaultPrevented&&!e.metaKey&&!e.ctrlKey){e.preventDefault();history.pushState({},'',href);dispatchEvent(new PopStateEvent('popstate'))}}})}`
        : a.path === 'next/navigation' ? `export function useRouter(){return{push(path){history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'))}}}`
        : `const callbacks=new Set();function session(){document.cookie='fixture_owner='+window.fixtureOwner+'; Path=/';return window.fixtureOwner?{access_token:'fixture:'+window.fixtureOwner,user:{id:window.fixtureOwner,app_metadata:{provider:'google'},user_metadata:{}}}:null}window.fixtureSwitchOwner=id=>{window.fixtureOwner=id;const value=session();callbacks.forEach(fn=>fn(value?'SIGNED_IN':'SIGNED_OUT',value))};const client={auth:{async getSession(){return{data:{session:session()},error:null}},onAuthStateChange(fn){callbacks.add(fn);return{data:{subscription:{unsubscribe(){callbacks.delete(fn)}}}}}},storage:{from(){return{async uploadToSignedUrl(path,token,file){const r=await fetch('/storage/'+path,{method:'PUT',body:file,headers:{Authorization:'Bearer fixture:'+window.fixtureOwner}});return{error:r.ok?null:new Error('Local storage fixture rejected upload')}}}}}};export function createClient(){return client}`,
      }));
    } }],
  });
  bundle = bundled.outputFiles[0].contents; report.bundle_sha256 = createHash('sha256').update(bundle).digest('hex');
  const cssDir = existsSync('.next/static/chunks') ? '.next/static/chunks' : '.next/dev/static/chunks';
  const styles = (await readdir(cssDir)).filter(name => name.endsWith('.css'));
  css = (await Promise.all(styles.map(name => readFile(cssDir + '/' + name, 'utf8')))).join('\n');
  browser = await chromium.launch({ headless: true, executablePath: existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await context.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin !== origin) { report.blocked_external_requests.push(u.origin); return route.abort(); } return route.continue(); });
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => report.page_errors.push(error.message));
  await page.goto(origin + '/research-verification/new-assessment');
  await page.getByRole('button', { name: 'Upload', exact: true }).waitFor();
  let release;
  gates.set('Paper A.pdf', new Promise(resolve => { release = resolve; }));
  await check('multiple uploads continue through navigation without automatic review or assessment start', async () => {
    await page.getByLabel('Paper PDF', { exact: true }).setInputFiles([pdf('Paper A.pdf'), pdf('Paper B.pdf')]);
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    await page.getByRole('link', { name: 'Browse home', exact: true }).click();
    await page.getByRole('heading', { name: 'Browsing JumpServe' }).waitFor(); release();
    for (let attempt = 0; attempt < 200; attempt++) {
      if (records.size === 2 && [...records.values()].every(r => r.paper_review_status === 'preparing')) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(records.size, 2);
    assert.ok([...records.values()].every(r => r.paper_review_status === 'preparing'));
    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(requests.filter(r => r.action === 'confirm').length, 0);
    assert.ok([...records.values()].every(r => r.bytes_verified));
    await page.locator('[data-assessment-notice]').nth(1).waitFor();
    assert.equal(await page.getByRole('progressbar', { name: 'Paper preparation in progress' }).count(), 2);
    return { parallel_papers: 2, route: '/', exact_bytes_verified: true, confirm_requests: 0 };
  });
  const [a, b] = [...records.values()];
  await check('a status outage is visible and does not invent ready papers', async () => {
    failureMode = true;
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await page.getByRole('alert').filter({ hasText: 'Paper notifications are temporarily unavailable' }).waitFor();
    assert.equal(await page.locator('[data-paper-notice]').count(), 0);
    failureMode = false;
    await page.getByRole('button', { name: 'Retry status', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[role=alert]'));
    return { outage_visible: true, ready_notices_during_outage: 0, retry_recovers: true };
  });
  await check('ready notifications appear while browsing and persist beyond a poll interval', async () => {
    a.paper_review_status = 'ready'; b.paper_review_status = 'ready';
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await page.locator('[data-paper-notice]').nth(1).waitFor();
    await page.waitForTimeout(11000);
    assert.equal(await page.locator('[data-paper-notice]').count(), 2);
    await page.getByRole('link', { name: 'Browse ideas', exact: true }).click();
    assert.equal(await page.locator('[data-paper-notice]').count(), 2);
    const rect = await page.getByRole('complementary', { name: 'Paper notifications' }).boundingBox();
    assert.ok(rect.x + rect.width >= 1340 && rect.y + rect.height >= 870);
    return { sticky_after_ms: 11000, navigation_persists: true, bottom_right: true };
  });
  await check('review action closes only its popup and opens matching paper details without auto-confirming', async () => {
    await page.locator(`[data-paper-notice="${a.id}"]`).getByRole('link', { name: 'Review paper' }).click();
    await page.getByRole('form', { name: 'Confirm paper information' }).waitFor();
    assert.equal(await page.getByLabel('Title', { exact: true }).inputValue(), a.title);
    assert.equal(await page.getByLabel('Research Domain', { exact: true }).inputValue(), 'Software verification');
    assert.equal(await page.getByRole('checkbox').count(), 1);
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
    await page.getByRole('checkbox', { name: 'Assess testable finding 1' }).check();
    assert.ok((await page.getByRole('form', { name: 'Confirm paper information' }).innerText()).includes('PDF page 1'));
    assert.equal(requests.filter(r => r.action === 'confirm').length, 0);
    assert.equal(await page.locator(`[data-paper-notice="${a.id}"]`).count(), 0);
    assert.equal(await page.locator(`[data-paper-notice="${b.id}"]`).count(), 1);
    return { matching_paper: a.id, review_dismisses_matching_notice: true, other_notice_retained: true, explicit_confirmation_required: true };
  });
  await check('dismissal survives navigation reload and subsequent polling', async () => {
    await page.getByRole('button', { name: 'Confirm and start assessment', exact: true }).click();
    await page.waitForURL(/experiment-queue\?assessment=/);
    assert.equal(requests.filter(r => r.action === 'confirm').length, 1);
    assert.equal(a.paper_review_status, 'confirmed');
    await page.getByRole('link', { name: 'Browse home', exact: true }).click(); await page.reload();
    await page.locator(`[data-paper-notice="${b.id}"]`).waitFor();
    assert.equal(await page.locator(`[data-paper-notice="${a.id}"]`).count(), 0);
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await page.waitForTimeout(250);
    assert.equal(await page.locator(`[data-paper-notice="${a.id}"]`).count(), 0);
    const saved = await page.evaluate(() => localStorage.getItem('jumpserve.paper-notices.v1.' + window.fixtureOwner));
    assert.ok(!saved.includes(a.title)); assert.ok(!saved.includes('fixture:')); return { dismissed_persists: true, explicit_confirmation_saved: true, browser_preferences_contain_only_ids_and_kinds: true };
  });
  await check('legacy backend progress uses anonymous queue reads and isolates failures between paper popups', async () => {
    legacyStatusMode = true;
    b.paper_review_status = 'confirmed'; b.assessment_status = structuredClone(a.assessment_status);
    await page.evaluate(() => dispatchEvent(new Event('online')));
    const first = page.locator(`[data-assessment-notice="${a.id}"]`), other = page.locator(`[data-assessment-notice="${b.id}"]`);
    await other.getByRole('heading', { name: 'Assessing your paper…', exact: true }).waitFor();
    await first.getByText('0 of 1 recorded claim checks finished.', { exact: true }).waitFor();
    queueFailures.add(a.id);
    b.assessment_status = { status: 'completed-with-blockers', updated_at: new Date().toISOString(), counts: { total: 1, finished: 0, reproduced: 0, discrepant: 0, blocked: 1, running: 0, queued: 0, waiting: 0 } };
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await first.getByText(/Shared queue retrieval failed \(HTTP 503\)/).waitFor();
    await first.getByText('0 of 1 recorded claim checks finished.', { exact: true }).waitFor();
    assert.equal(await first.getByRole('progressbar').count(), 0);
    await other.getByRole('heading', { name: 'Assessment finished with gaps', exact: true }).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE-CANARY'));
    const calls = requests.filter(request => request.path.endsWith('/queue'));
    assert.ok(calls.length >= 4); assert.ok(calls.every(request => request.method === 'GET' && !request.authorization_present && !request.cookie_present));
    queueFailures.clear(); legacyStatusMode = false; b.paper_review_status = 'ready'; delete b.assessment_status;
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await first.getByRole('progressbar').waitFor();
    await page.waitForFunction(() => !document.body.innerText.includes('Shared queue retrieval failed'));
    return { legacy_field_missing: true, completed_intake_accepted_without_scientific_label: true, recorded_counts_preserved: true, per_paper_failures: true, anonymous_read_only_requests: calls.length, tokens_and_cookies_forwarded: false, recovery: true };
  });
  await check('assessment progress stays while browsing with recorded counts and an exact queue link', async () => {
    const card=page.locator(`[data-assessment-notice="${a.id}"]`);
    await card.getByRole('heading',{name:'Assessing your paper…',exact:true}).waitFor();
    await card.getByText('0 of 1 recorded claim checks finished.',{exact:true}).waitFor();
    assert.equal(await card.getByRole('link',{name:'View experiment queue'}).getAttribute('href'),'/research-verification/experiment-queue?assessment='+a.id);
    await page.getByRole('link',{name:'Browse ideas',exact:true}).click();await card.waitFor();
    for(const width of [1365,390])for(const dark of [false,true]){
      await page.setViewportSize({width,height:width===390?844:900});await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const bounds=await card.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
      await page.screenshot({path:`${directory}/assessment-progress-${width}-${dark?'dark':'light'}.png`,fullPage:true});
    }
    failureMode=true;await page.evaluate(()=>dispatchEvent(new Event('online')));
    await card.getByText('Status is temporarily unavailable. The last recorded progress is shown.',{exact:true}).waitFor();
    assert.equal(await card.getByRole('progressbar').count(),0);
    await card.getByText('0 of 1 recorded claim checks finished.',{exact:true}).waitFor();
    failureMode=false;await page.getByRole('button',{name:'Retry status',exact:true}).click();await card.getByRole('progressbar').waitFor();
    await card.getByRole('link',{name:'View experiment queue',exact:true}).click();await page.waitForURL(/experiment-queue\?assessment=/);
    assert.equal(new URL(page.url()).searchParams.get('assessment'),a.id);assert.equal(await card.count(),0);
    await page.reload();await page.locator(`[data-paper-notice="${b.id}"]`).waitFor();assert.equal(await card.count(),0);
    assert.equal(requests.filter(r=>r.action==='cancel').length,0);
    return {counts_from_recorded_status:true,route_navigation:true,reload_restoration:true,widths:[1365,390],themes:['light','dark'],stale_status_explicit:true,matching_queue_link:true,view_link_closes_popup:true,cancel_requests:0};
  });
  await check('a later completion with gaps appears after progress was closed and stays until dismissed',async()=>{
    a.assessment_status={status:'completed-with-blockers',updated_at:new Date().toISOString(),counts:{total:1,finished:0,reproduced:0,discrepant:0,blocked:1,running:0,queued:0,waiting:0}};
    await page.evaluate(()=>dispatchEvent(new Event('online')));
    const card=page.locator(`[data-assessment-notice="${a.id}"]`);
    await card.getByRole('heading',{name:'Assessment finished with gaps',exact:true}).waitFor();
    assert.equal(await card.getByRole('progressbar').count(),0);
    await page.reload();await card.getByRole('heading',{name:'Assessment finished with gaps',exact:true}).waitFor();
    await card.getByRole('button',{name:'Dismiss assessment notification for '+a.title,exact:true}).click();await page.reload();
    await page.locator(`[data-paper-notice="${b.id}"]`).waitFor();assert.equal(await card.count(),0);
    return {completion_independent_of_progress_dismissal:true,unresolved_claims_explicit:true,completion_survives_reload:true,explicit_dismissal_persists:true};
  });
  await check('desktop and mobile notification cards fit in light and dark modes', async () => {
    for (const width of [1365, 390]) for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 }); await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
      await page.waitForFunction(() => {
        const close = document.querySelector('[data-paper-notice] button[aria-label^="Dismiss"]');
        return close && getComputedStyle(close).color === getComputedStyle(close.closest('article')).color;
      });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const bounds = await page.locator(`[data-paper-notice="${b.id}"]`).boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      await page.screenshot({ path: `${directory}/notifications-${width}-${dark ? 'dark' : 'light'}.png`, fullPage: true });
    }
    return { widths: [1365, 390], themes: ['light', 'dark'], horizontal_overflow: false };
  });
  await check('184 retained statements become separate review sections with explicit independent selections', async () => {
    const paper = '40000000-0000-4000-8000-000000000001';
    const claims = Array.from({ length: 184 }, (_, i) => ({ id: `50000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, description: `Statement ${i + 1}: latency is 10 ms under fixed conditions.`, source_id: source, location: `PDF page ${i + 1}`, claim_type: 'numerical' }));
    const organization = { version: 'paper-review-selection-v1', status: 'ready', central_claims: claims.slice(0, 3).map(c => ({ claim_id: c.id, label: c.description })), testable_findings: claims.slice(3, 15).map(c => ({ claim_id: c.id, label: c.description })), candidate_count: 184, cursor: 184 };
    let value = { ...review({ id: paper, title: 'Explicit 184-statement browser fixture', paper_review_status: 'ready' }), claims, organization }, saved;
    await page.route(origin + '/research/paper-uploads', async route => {
      const body = route.request().postDataJSON();
      if (body.request_id !== paper) return route.continue();
      if (body.action === 'confirm') { saved = body; value = { ...value, status: 'confirmed', can_start: false, confirmation: { title: body.title, domain: body.domain, claim_ids: body.claim_ids, selection: body.selection } }; }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
    });
    await page.goto(origin + '/research-verification/new-assessment/' + paper);
    const central = page.getByRole('group', { name: 'Central Claims', exact: true }), findings = page.getByRole('group', { name: 'Testable Findings', exact: true });
    await central.waitFor(); assert.equal(await central.getByRole('checkbox').count(), 3); assert.equal(await findings.getByRole('checkbox').count(), 12);
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0); assert.equal(await page.getByRole('button', { name: 'Confirm and start assessment' }).isDisabled(), true);
    await central.getByRole('checkbox').first().check(); await findings.getByRole('checkbox').first().check();
    await page.getByText('Other extracted statements (169)', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Find extracted statements' }).fill('Statement 184:');
    await page.getByRole('button', { name: 'Add to testable findings', exact: true }).click();
    assert.equal(await findings.getByRole('checkbox').count(), 13);
    await findings.getByRole('checkbox').last().check();
    await findings.getByRole('button', { name: 'Move to central claims', exact: true }).first().click();
    assert.equal(saved, undefined, 'Selecting, adding and moving statements must not submit the assessment.');
    assert.equal(await page.getByLabel('Title', { exact: true }).isEnabled(), true);
    for (const width of [1365, 390]) for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 }); await page.evaluate(v => document.documentElement.classList.toggle('dark', v), dark);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${directory}/review-groups-${width}-${dark ? 'dark' : 'light'}.png`, fullPage: true });
    }
    assert.equal(saved, undefined, 'Reviewing the selection must not start an assessment.');
    // Keep the unrelated notice open; use the unobstructed desktop form action.
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.getByRole('button', { name: 'Confirm and start assessment' }).click();
    await page.waitForURL(/experiment-queue\?assessment=/);
    assert.deepEqual(new Set(saved.selection.central_claims), new Set([claims[0].id, claims[3].id]));
    assert.deepEqual(saved.selection.testable_findings, [claims[183].id]); assert.equal(saved.claim_ids.length, 3);
    await page.goto(origin + '/research-verification/new-assessment/' + paper);
    await page.getByRole('form', { name: 'Confirm paper information' }).waitFor();
    assert.equal(await central.getByRole('checkbox', { checked: true }).count(), 2); assert.equal(await findings.getByRole('checkbox', { checked: true }).count(), 1);
    value = { ...value, status: 'ready', can_start: true, confirmation: null, organization: { ...organization, central_claims: [], testable_findings: [] } };
    await page.reload(); await central.waitFor(); assert.equal(await page.getByRole('checkbox').count(), 0);
    assert.equal(await page.getByText('No statements were suggested for this section.', { exact: false }).count(), 2);
    await page.getByText('184 source-linked statements extracted.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Confirm and start assessment' }).isDisabled(), true);
    delete value.organization; await page.reload(); await page.getByText('The connected service needs the review-grouping update before a new grouped selection can be saved.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Central claims and findings have not been organized', exact: true }).waitFor();
    assert.equal(await page.getByText('Category suggestions are not available yet.', { exact: false }).count(), 2);
    assert.equal(await page.getByText('No statements were suggested for this section.', { exact: false }).count(), 0);
    assert.equal(await page.getByText('0 selected of 0 suggested or user-assigned items.', { exact: true }).count(), 0);
    await page.getByText('Extracted statements (184)', { exact: true }).click();
    await page.getByText('Organization has not finished.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add to central claims', exact: true }).count(), 0);
    assert.equal(await page.getByRole('checkbox').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Confirm and start assessment' }).isDisabled(), true);
    for (const width of [1365, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.screenshot({ path: `${directory}/review-grouping-unavailable-${width}.png`, fullPage: true });
    }
    value.organization = { ...organization, status: 'unorganized', central_claims: [], testable_findings: [], cursor: 0, rationale: 'Grouping has not run over this retained inventory.' };
    await page.reload(); await page.getByRole('button', { name: 'Organize extracted statements', exact: true }).waitFor();
    await page.getByText(value.organization.rationale, { exact: true }).waitFor();
    assert.equal(await page.getByText('No statements were suggested for this section.', { exact: false }).count(), 0);
    await page.unroute(origin + '/research/paper-uploads');
    return { candidate_count: 184, suggested_central: 3, suggested_findings: 12, retained_other: 169, selected_for_assessment: 3, original_units_and_locations_retained: true, empty_and_legacy_states_explicit: true, unrun_grouping_not_reported_as_zero_suggestions: true, unavailable_grouping_cannot_accept_unsaveable_assignments: true, semantic_model_quality_evaluated: false };
  });
  await check('both assessment lists show source-ordered authors and explicit missing metadata',async()=>{
    a.title='Congestion Avoidance and Control';a.authors=['Van Jacobson','Michael J. Karels'];b.authors=null;
    for(const route of ['/research-verification/my-assessments','/research-verification/previous-assessments']){
      await page.goto(origin+route);
      const article=page.getByRole('link',{name:a.title,exact:true}).locator('xpath=ancestor::article');
      await article.locator('[data-paper-authors]').filter({hasText:'Van Jacobson, Michael J. Karels'}).waitFor();
      await page.getByText('Authors unavailable',{exact:true}).waitFor();
      for(const width of [1365,390])for(const dark of [false,true]){
        await page.setViewportSize({width,height:width===390?844:900});await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.screenshot({path:`${directory}/authors-${route.split('/').pop()}-${width}-${dark?'dark':'light'}.png`,fullPage:true});
      }
    }
    return {routes:['assessments','previous-assessments'],same_source_order:true,missing_authors_explicit:true,widths:[1365,390],themes:['light','dark']};
  });
  await check('account change and sign-out hide previous-owner notices without changing their dismissals', async () => {
    await page.evaluate(id => window.fixtureSwitchOwner(id), ownerB);
    await page.waitForFunction(() => document.querySelectorAll('[data-paper-notice],[data-assessment-notice]').length === 0);
    await page.evaluate(id => window.fixtureSwitchOwner(id), ownerA);
    await page.locator(`[data-paper-notice="${b.id}"]`).waitFor();
    assert.equal(await page.locator(`[data-paper-notice="${a.id}"]`).count(), 0);
    await page.evaluate(() => window.fixtureSwitchOwner(null));
    await page.waitForFunction(() => document.querySelectorAll('[data-paper-notice]').length === 0);
    return { account_scoped: true, signed_out_notices: 0 };
  });
  assert.deepEqual(report.page_errors, []); assert.deepEqual(report.blocked_external_requests, []); report.passed = true;
} catch (error) {
  report.passed = false; report.error = error.stack; process.exitCode = 1;
  const page = browser?.contexts()[0]?.pages()[0]; if (page && !page.isClosed()) { await page.screenshot({ path: directory + '/failure.png', fullPage: true }); await writeFile(directory + '/failure.html', await page.content()); }
} finally {
  if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  report.ended_at = new Date().toISOString(); report.requests = requests;
  await writeFile(directory + '/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ directory, passed: report.passed, checks: report.checks.length, error: report.error }));
}
