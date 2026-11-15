// Fixed, read-only production verification. No authentication, launches or arbitrary origins.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const revision = process.argv[2];
assert.ok(process.argv.length === 3 && /^[a-f0-9]{40}$/.test(revision), 'Pass the exact deployed Git revision.');
const origin = 'https://jumpserve.quaint-lab.org';
const base = '/research-verification', list = base + '/assessments';
const directory = '.test-artifacts/assessment-navigation-production/' + new Date().toISOString().replaceAll(':', '-');
await mkdir(directory, { recursive: true });
const report = { revision, origin, started_at: new Date().toISOString(), checks: [], browser_errors: [], research_writes: [], conditional_gaps: ['Authenticated owner writes and Google OAuth are covered separately.'], passed: false };
let browser;
async function check(name, run) {
  try { report.checks.push({ name, passed: true, evidence: await run() }); console.log('PASS ' + name); }
  catch (error) { report.checks.push({ name, passed: false, error: error.message }); throw error; }
}
try {
  const version = await fetch(origin + '/api/platform-version', { cache: 'no-store' });
  assert.equal(version.status, 200);
  const value = await version.json();
  assert.equal(value.revision, revision);
  report.production_version = value;
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, executablePath: existsSync(chrome) ? chrome : undefined });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.browser_errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/research/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) report.research_writes.push({ method: request.method(), path: url.pathname });
  });
  let id, title;
  await check('Table is the default and Card shows the same assessments', async () => {
    const response = await page.goto(origin + list, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
    const table = page.getByRole('table', { name: 'Assessments', exact: true });
    await table.locator('tbody tr[data-paper-id]').first().waitFor();
    const ids = await table.locator('tbody tr[data-paper-id]').evaluateAll(rows => rows.map(row => row.dataset.paperId));
    const views = page.getByRole('navigation', { name: 'Assessment view', exact: true });
    assert.equal(await views.getByRole('button', { name: 'Table', exact: true }).getAttribute('aria-current'), 'page');
    id = ids[0]; title = await table.locator('tbody tr[data-paper-id]').first().getByRole('link').innerText();
    await views.getByRole('button', { name: 'Card', exact: true }).click();
    await page.locator('article[data-paper-id]').first().waitFor();
    assert.deepEqual(await page.locator('article[data-paper-id]').evaluateAll(rows => rows.map(row => row.dataset.paperId)), ids);
    await page.reload(); await page.locator('article[data-paper-id]').first().waitFor();
    assert.equal(new URL(page.url()).searchParams.get('view'), 'card');
    await views.getByRole('button', { name: 'Table', exact: true }).click(); await table.waitFor();
    return { assessment_count: ids.length, card_survives_reload: true };
  });
  const detail = base + '/assessment/' + id;
  await check('assessment detail shows public paper metadata without status, records or queue sections', async () => {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/research/papers/' + id);
    const queueRequests = [];
    const watch = request => {if (/\/research\/studies\/[^/]+\/(queue|autonomy)$/.test(new URL(request.url()).pathname)) queueRequests.push(request.url());};
    page.on('request', watch);
    await page.goto(origin + detail, { waitUntil: 'domcontentloaded' });
    const response = await pending; assert.equal(response.status(), 200);
    const metadata = await response.json(); assert.equal(metadata.paper.id, id);
    const headers = await response.request().allHeaders(); assert.equal(headers.authorization, undefined); assert.equal(headers.cookie, undefined);
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    for (const name of ['Assessment status', 'Claim progress', 'Experiment Queue']) assert.equal(await page.getByRole('region', {name, exact: true}).count(), 0);
    assert.equal(await page.getByRole('button', {name: 'View assessment records', exact: true}).count(), 0);
    assert.equal(await page.locator('[data-assessment-stage]').count(), 0);
    assert.equal(await page.locator('aside').getByRole('link', {name: 'Experiment Queue', exact: true}).count(), 0);
    assert.deepEqual(queueRequests, []); page.off('request', watch);
    return {assessment: id, public_metadata: true, removed_sections_absent: true, queue_requests: 0};
  });
  await check('saved queue links redirect to the assessment and preserve job identities', async () => {
    const job = '99999999-9999-4999-8999-999999999999';
    for (const key of ['assessment', 'study']) {
      const response = await fetch(origin + base + '/experiment-queue?' + new URLSearchParams([[key, id], ['job', job], ['view', 'private'], ['tag', 'first'], ['tag', 'second']]), { redirect: 'manual' });
      assert.equal(response.status, 308); const location = new URL(response.headers.get('location'), origin);
      assert.equal(location.pathname, detail); assert.equal(location.searchParams.get('job'), job); assert.equal(location.hash, '#job-' + job);
      assert.deepEqual(location.searchParams.getAll('tag'), ['first', 'second']); assert.equal(location.searchParams.has('view'), false);
    }
    await page.goto(origin + '/experiment-queue?assessment=' + id, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(url => url.pathname === detail);
    const jobPath = detail + '?job=' + job + '#job-' + job;
    await page.goto(origin + jobPath, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', {name: title, exact: true}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('job'), job);
    assert.equal(await page.getByRole('region', {name: 'Experiment Queue', exact: true}).count(), 0);
    const empty = await fetch(origin + base + '/experiment-queue', { redirect: 'manual' }); assert.equal(empty.status, 308);
    const destination = new URL(empty.headers.get('location'), origin); assert.equal(destination.pathname, list); assert.equal(destination.searchParams.get('mine'), '1');
    return { legacy_aliases: 3, job_identity_preserved: true, removed_queue_stays_absent: true, retired_index_uses_my_assessments: true };
  });
  await check('follow-up actions retain sign-in and exact assessment identity', async () => {
    const next = detail + '?gap=22222222-2222-4222-8222-222222222222&run=33333333-3333-4333-8333-333333333333';
    await page.goto(origin + next, { waitUntil: 'domcontentloaded' }); await page.waitForURL(url => url.pathname === '/login');
    const returned = new URL(new URL(page.url()).searchParams.get('next'), origin), expected = new URL(next, origin);
    assert.equal(returned.origin, expected.origin); assert.equal(returned.pathname, expected.pathname);
    assert.deepEqual([...returned.searchParams].sort(), [...expected.searchParams].sort()); assert.equal(returned.hash, expected.hash);
    return { exact_return_path: true, unauthenticated_launches: 0 };
  });
  await check('desktop and mobile themes retain the assessment header without the removed sections', async () => {
    for (const width of [1365, 390]) for (const theme of ['Light Mode', 'Dark Mode']) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(origin + detail, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', {name: title, exact: true}).waitFor();
      assert.equal(await page.getByRole('region', {name: 'Experiment Queue', exact: true}).count(), 0);
      await page.getByRole('button', { name: theme, exact: true }).click();
      await page.waitForFunction(dark => document.documentElement.classList.contains('dark') === dark, theme === 'Dark Mode');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const framed = await page.locator('.content-panel').evaluateAll(nodes => nodes.filter(node => {
        const style = getComputedStyle(node);
        return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth, style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].some(value => parseFloat(value) > 0);
      }).length);
      assert.equal(framed, 0, 'Content containers stay square and borderless');
      if (width === 390) {
        await page.getByRole('button', { name: 'Open module menu', exact: true }).click();
        assert.equal(await page.getByRole('dialog').getByRole('link', { name: 'Experiment Queue', exact: true }).count(), 0); await page.keyboard.press('Escape');
      }
      await page.screenshot({ path: directory + '/assessment-' + width + '-' + (theme === 'Dark Mode' ? 'dark' : 'light') + '.png', fullPage: true });
    }
    return { widths: [1365, 390], themes: ['light', 'dark'], horizontal_overflow: false };
  });
  assert.deepEqual(report.research_writes, []); assert.deepEqual(report.browser_errors, []); report.passed = true;
} catch (error) { report.error = error.stack; process.exitCode = 1; }
finally {
  if (browser) await browser.close(); report.ended_at = new Date().toISOString();
  await writeFile(directory + '/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ directory, passed: report.passed, error: report.error }));
}
