import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
const hook = registerHooks({ resolve(specifier, context, next) {
  const path = specifier.startsWith('@/lib/') ? specifier.slice(6) : ['./research-paper-upload', './assessment-notifications', './research-public-queue'].includes(specifier) ? specifier.slice(2) : null;
  return next(path ? new URL('../lib/'+path+'.ts', import.meta.url).href : specifier, context);
} });
const { PaperUploadManager, parsePaperNoticePreferences, PAPER_UPLOAD_PARALLELISM, PAPER_STATUS_PARALLELISM } = await import('../lib/paper-upload-manager.ts');
hook.deregister();
const owner = '10000000-0000-4000-8000-000000000001';
const first = '20000000-0000-4000-8000-000000000001', second = '20000000-0000-4000-8000-000000000002';
const pdf = name => new File(['%PDF-1.4\nExplicit unit fixture.\n%%EOF'], name, { type: 'application/pdf' });
const storage = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };
function queueStatus(id, status = 'running') {
  const stamp = '2026-10-25T18:00:00Z';
  const workflow = { study_id: id, max_spend_cents: 10000, max_attempts: null, committed_cents: 0, status, reason: 'Recorded fixture status', created_at: stamp, updated_at: stamp, deadline_at: stamp };
  const tasks = status === null ? [] : [['resolved', null], ['resolved', 'reproduced'], ['running', 'inconclusive'], ['queued', 'untested']].map(([state, label], index) => ({
    id: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`, study_id: id,
    claim_id: index === 0 ? null : `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    claim_title: index === 0 ? null : 'Explicit fixture claim', stage: index === 0 ? 'intake' : 'planning', status: state, label, attempts: 0, reason: 'Recorded fixture status', created_at: stamp, updated_at: stamp,
  }));
  return { version: 'research-public-queue-v1', access: 'public-read-only', study: { id, title: 'Fixture paper' }, jobs: [], workers_enabled: true, coverage: { jobs: 0 }, limitations: 'Fixture status only', autonomy: {
    version: 'research-autonomy-v3', access: 'public-read-only', defaults: { maximum_spend_usd: 100, elapsed_days: 7, attempts_per_claim: null }, enabled: true,
    workflows: status === null ? [] : [workflow], tasks, coverage: { workflows: status === null ? 0 : 1, tasks: tasks.length },
  } };
}
async function until(predicate) { const end = Date.now() + 5000; while (!predicate()) { if (Date.now() > end) throw Error('Unit fixture did not settle within 5 seconds.'); await delay(5); } }
function fixture(t, options = {}) {
  const calls = [], studies = new Map(), reserved = new Map();
  const local = options.storage ?? storage();
  const request = async (path, init) => {
    calls.push({ path, body: init?.body && JSON.parse(init.body), signal: init?.signal });
    if (path === '/studies?mine=1&status=1') return options.list ? options.list() : { access: 'owner-drafts', studies: [...studies.values()] };
    if (path === '/capabilities') return { autonomy: { version: 'research-autonomy-v3', enabled: true }, paper_uploads: { version: 'research-paper-upload-v2', review_version: 'research-paper-review-v1', maximum_bytes: 10000000, confirmation_required: true } };
    const body = JSON.parse(init.body), id = body.request_id;
    if (body.action === 'reserve') {
      reserved.set(id, body);
      return { version: 'research-paper-upload-v2', id, status: 'pending', bucket: 'research-paper-uploads', path: id + '/' + body.sha256, sha256: body.sha256, byte_count: body.byte_count, maximum_bytes: 10000000, token: 'explicit-local-unit-upload-token' };
    }
    if (options.prepare) await options.prepare(id);
    studies.set(id, { id, title: 'Extracted paper title ' + id, study_kind: 'paper', paper_review_status: 'preparing' });
    return { id, review_version: 'research-paper-review-v1', status: 'preparing' };
  };
  const manager = new PaperUploadManager(options.ownerId ?? owner, request, options.upload ?? (async () => {}), options.readQueue ?? (async id => queueStatus(id, null)));
  t.after(() => manager.stop()); manager.start(local);
  return { manager, local, studies, reserved, calls };
}

test('several PDFs retain independent identities and upload at bounded parallelism', async t => {
  const releases = []; let inFlight = 0, peak = 0;
  const f = fixture(t, { upload: async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise(resolve => releases.push(() => { inFlight--; resolve(); })); } });
  f.manager.enqueue(Array.from({ length: 7 }, (_, i) => pdf(`paper-${i}.pdf`)));
  await until(() => releases.length === PAPER_UPLOAD_PARALLELISM);
  assert.equal(f.manager.getSnapshot().uploads.filter(u => u.phase === 'queued').length, 4);
  for (let i = 0; i < 7; i++) { await until(() => releases.length > i); releases[i](); }
  await until(() => f.manager.getSnapshot().uploads.every(u => u.phase === 'preparing'));
  assert.equal(peak, PAPER_UPLOAD_PARALLELISM);
  assert.equal(new Set(f.manager.getSnapshot().uploads.map(u => u.id)).size, 7);
  assert.equal(f.reserved.size, 7);
  assert.equal(f.calls.filter(c => c.body?.action === 'confirm').length, 0);
  assert.equal(f.manager.hasTransfers(), false);
});

test('preparation status never invents readiness; ready notices stay through confirmation until dismissed', async t => {
  const f = fixture(t);
  f.studies.set(first, { id: first, title: 'Paper One', paper_review_status: 'preparing' });
  await f.manager.refresh(); assert.deepEqual(f.manager.getSnapshot().notices, []);
  f.studies.get(first).paper_review_status = 'ready'; await f.manager.refresh();
  await until(() => f.manager.getSnapshot().notices.length === 1);
  f.studies.get(first).paper_review_status = 'confirmed'; await f.manager.refresh();
  assert.equal(f.manager.getSnapshot().notices[0].title, 'Paper One');
  f.manager.dismiss(first, 'ready'); await f.manager.refresh();
  assert.deepEqual(f.manager.getSnapshot().notices, []);
  const saved = f.local.getItem(f.manager.storageKey);
  assert.ok(!saved.includes('Paper One')); assert.ok(saved.includes(first));
});

test('server state restores notices after reload, including preparation completed while the browser was closed', async t => {
  const local = storage(), studies = [{ id: first, title: 'Paper One', paper_review_status: 'ready' }, { id: second, title: 'Paper Two', paper_review_status: 'ready' }];
  const f = fixture(t, { storage: local, list: () => ({ access: 'owner-drafts', studies }) });
  await until(() => f.manager.getSnapshot().notices.length === 2); f.manager.dismiss(first, 'ready'); f.manager.stop();
  studies[1].paper_review_status = 'confirmed';
  const restored = fixture(t, { storage: local, list: () => ({ access: 'owner-drafts', studies }) });
  await until(() => restored.manager.getSnapshot().notices.length === 1);
  assert.equal(restored.manager.getSnapshot().notices[0].id, second);
});

test('failure notices and later ready notices are separate; cross-tab dismissals are merged', async t => {
  const f = fixture(t);
  f.studies.set(first, { id: first, title: 'Paper One', paper_review_status: 'failed' }); await f.manager.refresh();
  await until(() => f.manager.getSnapshot().notices.length === 1); f.manager.dismiss(first, 'failed');
  f.studies.get(first).paper_review_status = 'ready'; await f.manager.refresh();
  assert.equal(f.manager.getSnapshot().notices[0].kind, 'ready');
  const saved = JSON.parse(f.local.getItem(f.manager.storageKey)); saved.dismissed.push(first + ':ready');
  f.local.setItem(f.manager.storageKey, JSON.stringify(saved)); f.manager.syncPreferences();
  assert.deepEqual(f.manager.getSnapshot().notices, []);
});

test('a failed upload retries with its original request ID and exact original file', async t => {
  let attempts = 0; const transferred = [];
  const f = fixture(t, { prepare: () => { if (++attempts === 1) throw Error('Explicit temporary storage outage'); }, upload: async (_ticket, file) => transferred.push(file) });
  const original = pdf('retry.pdf'); f.manager.enqueue([original]);
  await until(() => f.manager.getSnapshot().uploads[0]?.retryable);
  const id = f.manager.getSnapshot().uploads[0].id;
  f.manager.retry(id); await until(() => f.manager.getSnapshot().uploads[0].phase === 'preparing');
  assert.equal(f.reserved.size, 1); assert.deepEqual(transferred, [original, original]);
  assert.ok(f.calls.filter(c => c.body?.action === 'prepare').every(c => c.body.request_id === id));
});

test('an invalid PDF fails before network admission and remains distinguishable from prepared work', async t => {
  const f = fixture(t); f.manager.enqueue([new File(['bad'], 'bad.pdf')]);
  await until(() => f.manager.getSnapshot().uploads[0]?.retryable);
  assert.match(f.manager.getSnapshot().uploads[0].message, /PDF signature/);
  assert.equal(f.calls.filter(c => c.body).length, 0);
});

test('stop prevents stale results and queued file transfers from crossing an owner change', async t => {
  let release; let listCalls = 0;
  const f = fixture(t, { list: () => { listCalls++; return new Promise(resolve => { release = resolve; }); } });
  f.manager.stop(); release({ access: 'owner-drafts', studies: [{ id: first, title: 'Private old owner title', paper_review_status: 'ready' }] });
  await delay(0); assert.deepEqual(f.manager.getSnapshot().notices, []); assert.equal(listCalls, 1);
  assert.throws(() => f.manager.enqueue([pdf('later.pdf')]), /sign-in/);
  const other = fixture(t, { ownerId: '10000000-0000-4000-8000-000000000002', storage: f.local });
  assert.notEqual(other.manager.storageKey, f.manager.storageKey); assert.deepEqual(other.manager.getSnapshot().notices, []);
});

test('Strict Mode restart can poll while the previous effect request is being aborted', async t => {
  const pending = [];
  const f = fixture(t, { list: () => new Promise(resolve => pending.push(resolve)) });
  f.manager.stop(); f.manager.start(f.local); assert.equal(pending.length, 2);
  pending[1]({ access: 'owner-drafts', studies: [{ id: first, title: 'Current', paper_review_status: 'ready' }] });
  await until(() => f.manager.getSnapshot().notices.length === 1);
  pending[0]({ access: 'owner-drafts', studies: [{ id: second, title: 'Stale', paper_review_status: 'ready' }] });
  await delay(0); assert.deepEqual(f.manager.getSnapshot().notices.map(n => n.title), ['Current']);
});

test('malformed or unauthorized listings remain unavailable instead of becoming empty success', async t => {
  for (const bad of [{ access: 'published', studies: [] }, { access: 'owner-drafts', studies: [{ id: first, title: 'Paper', paper_review_status: 'invented' }] }]) {
    const f = fixture(t, { list: () => bad }); await until(() => Boolean(f.manager.getSnapshot().error));
    assert.match(f.manager.getSnapshot().error, /could not be verified/); assert.deepEqual(f.manager.getSnapshot().notices, []);
  }
  assert.throws(() => parsePaperNoticePreferences('{broken'));
  assert.throws(() => parsePaperNoticePreferences(JSON.stringify({ version: 1, seen: [{ id: 'bad', kind: 'ready' }], dismissed: [] })));
});

const summary = (status = 'running', counts = {}) => ({ status, updated_at: '2026-10-25T18:00:00Z', counts: { total: 3, finished: 0, reproduced: 0, discrepant: 0, blocked: 0, running: 1, queued: 2, waiting: 0, ...counts } });

test('paper activity follows recorded preparation, selected claim progress and completion with evidence gaps', async t => {
 const f=fixture(t);await delay(0);f.studies.set(first,{id:first,title:'Paper One',paper_review_status:'preparing'});
 await f.manager.refresh();assert.equal(f.manager.getSnapshot().activity[0].phase,'preparing');
 const row=f.studies.get(first);row.paper_review_status='ready';await f.manager.refresh();assert.equal(f.manager.getSnapshot().activity.length,0);
 row.paper_review_status='confirmed';row.assessment_status=summary();f.manager.trackAssessment(first,row.title);
 await f.manager.refresh();await until(()=>f.manager.getSnapshot().activity[0]?.counts?.total===3);assert.equal(f.manager.getSnapshot().activity[0].phase,'assessing');
 row.assessment_status=summary('completed-with-blockers',{finished:2,reproduced:1,discrepant:1,blocked:1,running:0,queued:0});await f.manager.refresh();
 const result=f.manager.getSnapshot().activity[0];assert.equal(result.phase,'finished');assert.equal(result.status,'completed-with-blockers');assert.equal(result.counts.finished,2);assert.equal(result.counts.blocked,1);
 assert.equal(f.calls.filter(c=>c.body?.action==='confirm').length,0);
});

test('restoration shows active assessments without replaying every historical completion or unpublished idea',async t=>{
 const rows=[{id:first,title:'Active paper',paper_review_status:'confirmed',assessment_status:summary()},{id:second,title:'Old completion',paper_review_status:'confirmed',assessment_status:summary('completed')},{id:'20000000-0000-4000-8000-000000000003',title:'Private idea',study_kind:'idea',assessment_status:summary()}];
 const f=fixture(t,{list:()=>({access:'owner-drafts',assessment_status_version:'research-assessment-status-v1',studies:rows})});
 await until(()=>f.manager.getSnapshot().activity.length>0);assert.deepEqual(f.manager.getSnapshot().activity.map(a=>a.title),['Active paper']);
});

test('closing progress never cancels work, persists across reloads and still allows a later completion notice',async t=>{
 const local=storage(),row={id:first,title:'Private current paper',paper_review_status:'confirmed',assessment_status:summary()};
 const options={storage:local,list:()=>({access:'owner-drafts',studies:[row]})};const f=fixture(t,options);
 await until(()=>f.manager.getSnapshot().activity.length===1);f.manager.dismissActivity(first,'assessing');await f.manager.refresh();assert.equal(f.manager.getSnapshot().activity.length,0);
 const saved=local.getItem(f.manager.storageKey);assert.ok(saved.includes(first));assert.ok(!saved.includes(row.title));assert.ok(!saved.includes('running'));
 f.manager.stop();const restored=fixture(t,options);await restored.manager.refresh();assert.equal(restored.manager.getSnapshot().activity.length,0);
 row.assessment_status=summary('completed',{finished:3,reproduced:2,discrepant:1,running:0,queued:0});await restored.manager.refresh();assert.equal(restored.manager.getSnapshot().activity[0].phase,'finished');
 restored.manager.dismissActivity(first,'finished');await restored.manager.refresh();assert.equal(restored.manager.getSnapshot().activity.length,0);
 assert.ok([...f.calls,...restored.calls].every(c=>!c.body?.action||c.body.action!=='cancel'));
});

test('missing assessment summaries stay unknown and invalid counts retain the last successful state',async t=>{
 const f=fixture(t);f.studies.set(first,{id:first,title:'Pending status',paper_review_status:'confirmed'});f.manager.trackAssessment(first,'Pending status');await f.manager.refresh();
 await until(()=>f.manager.getSnapshot().activity[0]?.status==='unavailable');assert.equal(f.manager.getSnapshot().activity[0].counts,null);
 const row=f.studies.get(first);row.assessment_status=summary();await f.manager.refresh();const previous=f.manager.getSnapshot().activity;
 for(const counts of [{reproduced:4},{running:3,queued:3}]){row.assessment_status=summary('completed',counts);await f.manager.refresh();assert.match(f.manager.getSnapshot().error,/progress could not be verified/);assert.deepEqual(f.manager.getSnapshot().activity,previous);}
 row.assessment_status=summary('cancelled',{running:0,queued:0});await f.manager.refresh();assert.equal(f.manager.getSnapshot().error,'');assert.equal(f.manager.getSnapshot().activity[0].status,'cancelled');
});

test('cross-tab activity dismissals merge without copying other account details',async t=>{
 const f=fixture(t);f.studies.set(first,{id:first,title:'Active',paper_review_status:'confirmed',assessment_status:summary()});await f.manager.refresh();
 const prefs=JSON.parse(f.local.getItem(f.manager.storageKey));prefs.activity.dismissed.push(first+':assessing');f.local.setItem(f.manager.storageKey,JSON.stringify(prefs));f.manager.syncPreferences();assert.deepEqual(f.manager.getSnapshot().activity,[]);
 const other=fixture(t,{ownerId:'10000000-0000-4000-8000-000000000002',storage:f.local});assert.deepEqual(other.manager.getSnapshot().activity,[]);
});

test('a listing that began before confirmation cannot erase or roll back its queued notice',async t=>{
 const pending=[];const f=fixture(t,{list:()=>new Promise(resolve=>pending.push(resolve))});
 f.manager.trackAssessment(first,'Confirmed paper title');
 pending.shift()({access:'owner-drafts',studies:[{id:first,title:'Old pre-review title',paper_review_status:'ready'}]});
 await until(()=>pending.length===1);
 assert.equal(f.manager.getSnapshot().activity[0].status,'submitted');assert.equal(f.manager.getSnapshot().activity[0].title,'Confirmed paper title');
 pending.shift()({access:'owner-drafts',studies:[{id:first,title:'Confirmed paper title',paper_review_status:'confirmed',assessment_status:summary()}]});
 await until(()=>f.manager.getSnapshot().activity[0]?.status==='running');assert.equal(f.manager.getSnapshot().activity[0].counts.total,3);
});

test('legacy listings restore real assessment progress through the read-only queue instead of reporting it unavailable', async t => {
  const calls = [];
  const f = fixture(t, { list: () => ({ access: 'owner-drafts', studies: [
    { id: first, title: 'Running paper', paper_review_status: 'confirmed' },
    { id: second, title: 'Review first', paper_review_status: 'ready' },
    { id: '20000000-0000-4000-8000-000000000003', title: 'Private idea', study_kind: 'idea', paper_review_status: 'confirmed' },
  ] }), readQueue: async (id, signal) => { calls.push({ id, signal }); return queueStatus(id); } });
  await until(() => f.manager.getSnapshot().activity.length === 1);
  const notice = f.manager.getSnapshot().activity[0];
  assert.equal(notice.status, 'running'); assert.equal(notice.counts.total, 3); assert.equal(notice.counts.finished, 1);
  assert.equal(notice.counts.reproduced, 1); assert.equal(notice.counts.running, 1); assert.equal(notice.counts.queued, 1);
  assert.deepEqual(calls.map(call => call.id), [first]); assert.ok(calls[0].signal instanceof AbortSignal);
  assert.equal(f.calls.filter(call => call.body).length, 0);
});

test('a failed legacy queue read retains that paper progress while other papers can finish and recover independently', async t => {
  let failing = false;
  const rows = [first, second].map(id => ({ id, title: 'Paper ' + id, paper_review_status: 'confirmed' }));
  const f = fixture(t, { list: () => ({ access: 'owner-drafts', studies: rows }), readQueue: async id => {
    if (failing && id === first) throw Error('Shared queue retrieval failed (HTTP 503). Current status is unknown.');
    return queueStatus(id, failing ? 'completed-with-blockers' : 'running');
  } });
  await until(() => f.manager.getSnapshot().activity.length === 2);
  failing = true; await f.manager.refresh();
  const previous = f.manager.getSnapshot().activity.find(row => row.id === first), finished = f.manager.getSnapshot().activity.find(row => row.id === second);
  assert.equal(previous.status, 'running'); assert.equal(previous.counts.total, 3); assert.match(previous.statusError, /HTTP 503/);
  assert.equal(finished.phase, 'finished'); assert.equal(finished.statusError, undefined); assert.equal(f.manager.getSnapshot().error, '');
  failing = false; await f.manager.refresh();
  assert.equal(f.manager.getSnapshot().activity.find(row => row.id === first).statusError, undefined);
});

test('legacy queue reads have bounded concurrency and owner changes abort and ignore late results', async t => {
  const releases = []; let active = 0, peak = 0;
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, title: 'Paper ' + i, paper_review_status: 'confirmed' }));
  const f = fixture(t, { list: () => ({ access: 'owner-drafts', studies: rows }), readQueue: async id => {
    active++; peak = Math.max(active, peak);
    await new Promise(resolve => releases.push(() => { active--; resolve(); })); return queueStatus(id);
  } });
  await until(() => releases.length === PAPER_STATUS_PARALLELISM);
  for (let index = 0; index < rows.length; index++) { await until(() => releases.length > index); releases[index](); }
  await until(() => f.manager.getSnapshot().activity.length === rows.length); assert.equal(peak, PAPER_STATUS_PARALLELISM);
  let release, signal;
  const old = fixture(t, { list: () => ({ access: 'owner-drafts', studies: [rows[0]] }), readQueue: async (id, value) => {
    signal = value; await new Promise(resolve => { release = resolve; }); return queueStatus(id);
  } });
  await until(() => release); old.manager.stop(); assert.equal(signal.aborted, true); release(); await delay(0);
  assert.deepEqual(old.manager.getSnapshot().activity, []);
});

test('modern summaries and unknown versions never fall back, while completed legacy statuses are briefly cached', async t => {
  let reads = 0;
  const readQueue = async id => { reads++; return queueStatus(id, 'completed'); };
  const row = { id: first, title: 'Paper', paper_review_status: 'confirmed', assessment_status: null };
  const modern = fixture(t, { list: () => ({ access: 'owner-drafts', assessment_status_version: 'research-assessment-status-v1', studies: [row] }), readQueue });
  await modern.manager.refresh(); assert.equal(reads, 0);
  const unsupported = fixture(t, { list: () => ({ access: 'owner-drafts', assessment_status_version: 'unknown', studies: [row] }), readQueue });
  await until(() => unsupported.manager.getSnapshot().error); assert.equal(reads, 0);
  const legacy = fixture(t, { list: () => ({ access: 'owner-drafts', studies: [row] }), readQueue });
  await until(() => reads === 1); await legacy.manager.refresh(); await legacy.manager.refresh(); assert.equal(reads, 1);
  legacy.manager.trackAssessment(first, row.title); await until(() => reads === 2);
});
