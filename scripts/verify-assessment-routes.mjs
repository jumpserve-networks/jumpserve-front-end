// Browser-free checks against a running local Next server. Synthetic identities
// exercise routing and access guards; no assessment data or model calls are used.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';

assert.ok(process.argv.length <= 3, 'Usage: npm run verify:research:assessment-routes -- http://localhost:6001');
const origin = new URL(process.argv[2] ?? 'http://localhost:6001');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'Use a local Next server.');
assert.ok(['http:', 'https:'].includes(origin.protocol) && origin.pathname === '/' && !origin.username && !origin.password && !origin.search && !origin.hash);
const id = '11111111-1111-4111-8111-111111111111';
const job = '22222222-2222-4222-8222-222222222222';
const canonical = '/research-verification/assessment/' + id;
const query = '?step=implementation&job=' + job + '&tag=a%26b&tag=second';
const checks = [];
const read = path => fetch(new URL(path, origin), {redirect: 'manual', signal: AbortSignal.timeout(15000)});

for (const prefix of ['', '/module', '/modules']) {
  for (const old of ['new-assessment', 'new-study']) {
    const path = prefix + '/research-verification/' + old + '/' + id;
    const response = await read(path + query);
    assert.equal(response.status, 308);
    const destination = new URL(response.headers.get('location'), origin);
    assert.equal(destination.pathname, canonical);
    assert.equal(destination.searchParams.get('step'), 'implementation');
    assert.equal(destination.searchParams.get('job'), job);
    assert.deepEqual(destination.searchParams.getAll('tag'), ['a&b', 'second']);
    checks.push('Permanent redirect preserves wizard, job and repeated queries: ' + path);
  }
}

for (const old of ['assessments', 'studies']) {
  const response = await read('/research-verification/' + old + '/' + id + query);
  assert.equal(response.status, 308);
  const destination = new URL(response.headers.get('location'), origin);
  assert.equal(destination.pathname, canonical);
  assert.equal(destination.searchParams.get('step'), 'implementation');
  assert.deepEqual(destination.searchParams.getAll('tag'), ['a&b', 'second']);
  checks.push('Legacy report redirects to the same assessment without a publication gate: ' + old);
}

const publicPage = await read(canonical + query);
assert.equal(publicPage.status, 200);
assert.equal(publicPage.headers.get('location'), null);
const publicHtml = await publicPage.text();
assert.match(publicHtml, /data-testid="assessment-detail"/);
assert.doesNotMatch(publicHtml, /id="experiment-queue"|aria-label="Assessment status"|View assessment records/);
assert.doesNotMatch(publicHtml, /Published assessment|Not published|Read published assessment|Publish reviewed snapshot/);
checks.push('Canonical page stays public without the removed status, records and queue sections');

const uploadPath = '/research-verification/new-assessment?tag=first&tag=second';
const upload = await read(uploadPath);
assert.equal(upload.status, 307);
const uploadLogin = new URL(upload.headers.get('location'), origin);
assert.equal(uploadLogin.pathname, '/login');
assert.equal(uploadLogin.searchParams.get('next'), uploadPath);
checks.push('Paper upload remains at new-assessment with its sign-in return intact');

const followUp = canonical + '?gap=' + job + '&run=' + id + '&step=implementation&tag=first&tag=second';
const guarded = await read(followUp);
assert.equal(guarded.status, 307);
const login = new URL(guarded.headers.get('location'), origin);
assert.equal(login.pathname, '/login');
assert.equal(login.searchParams.get('next'), followUp);
checks.push('Follow-up sign-in retains the complete canonical destination');

for (const path of ['/research-verification/assessment/invalid', canonical + '?job=invalid', canonical + '?job=' + job + '&job=' + id, canonical + '?run=' + job]) {
  assert.equal((await read(path)).status, 404);
}
checks.push('Invalid or ambiguous assessment and queue identities return 404');

const savedQueue = await read('/research-verification/experiment-queue?study=' + id + '&job=' + job + '&view=private&tag=first&tag=second');
assert.equal(savedQueue.status, 308);
const queueDestination = new URL(savedQueue.headers.get('location'), origin);
assert.equal(queueDestination.pathname, canonical);
assert.equal(queueDestination.searchParams.get('job'), job);
assert.deepEqual(queueDestination.searchParams.getAll('tag'), ['first', 'second']);
assert.equal(queueDestination.hash, '#job-' + job);
checks.push('Retired queue links retain the canonical assessment and job anchor');

await mkdir('.test-artifacts', {recursive: true});
await writeFile('.test-artifacts/assessment-route-http.json', JSON.stringify({passed: true, checks, limitations: 'Synthetic identities verify local routing and guards; no live data, Google session or model calls.'}, null, 2) + '\n');
for (const check of checks) console.log('PASS ' + check);
