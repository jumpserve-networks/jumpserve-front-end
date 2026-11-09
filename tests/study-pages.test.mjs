// Page data-selection/rendering units. These do not claim Next.js Flight,
// hydration, authentication or browser navigation integration coverage.
import assert from 'node:assert/strict';
import {beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';

globalThis.__studyPagesReact = React;
const readers = {
  '@/lib/delay-study-server': ['delay', ['getStudyCampaign', 'getStudyClaims', 'getStudyPapers']],
  '@/lib/leo-study-server': ['leo', ['getLeoCampaign', 'getLeoClaims', 'getLeoPapers']],
  '@/lib/http2-study-server': ['http2', ['getHttp2Data']],
  '@/lib/reliable-study-server': ['reliable', ['getReliableData']],
  '@/lib/ipv6-study-server': ['ipv6', ['getIPv6Data']],
};
const replacements = {
  'next/link': "export default function Link(props){return globalThis.__studyPagesReact.createElement('a',props);}",
  '@/app/components/user-preferences': "export const LocalDateTime=({value})=>globalThis.__studyPagesReact.createElement('time',{dateTime:value},value);",
};
for (const [path, [studyKey, names]] of Object.entries(readers)) replacements[path] = names.map(name => `export const ${name}=(...args)=>globalThis.__studyPagesRead(${JSON.stringify(studyKey)},${JSON.stringify(name)},args);`).join('');
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const routes = {};
for (const [key, studyKey] of Object.entries({delay: 'propagation-delay-study', leo: 'leo-emergency-failover', http2: 'http2-compliance-study', reliable: 'reliable-sketch-study', ipv6: 'ipv6-dns-study'})) {
  routes[key] = {studyKey};
  for (const page of ['methods', 'literature']) routes[key][page] = (await import(`../app/(modules)/${studyKey}/${page}/page.tsx`)).default;
}
hook.deregister();
let data, calls;
const sha = 'a'.repeat(64);
const source = (reference_number, changes = {}) => ({reference_number, citation: 'Synthetic cited source ' + reference_number, kind: 'research', role: 'direct-reference', download_status: 'downloaded', reading_status: 'reviewed', review_status: 'complete', access_status: 'available', source_url: 'https://example.test/source/' + reference_number, retrieved_url: 'https://example.test/version/' + reference_number, retrieved_version: 'Retained source edition', byte_count: 0, pages: 0, findings: 'Recorded reviewed findings', limitations: 'Partial source scope', sha256: sha, version_note: 'Original retained edition', reading_notes: 'Recorded substantive reading note', retrieval_attempts: [{status: 'retrieved'}], retrieval_audit: [{status: 'retrieved'}], ...changes});
beforeEach(() => {
  calls = []; const sources = [source(0), source(1, {download_status: 'failed', reading_status: 'unavailable', review_status: 'partial', source_url: null, retrieved_url: null, retrieved_version: null, byte_count: null, pages: null, findings: null, sha256: null, version_note: null, reading_notes: null}), source(2, {kind: 'software', review_status: 'unreviewed', pages: 7}), source(73, {review_status: 'unavailable', findings: null})];
  const claims = [{id: 'claim', claim_id: 'claim', figure: 'Figure 1', location: 'Page 3', coverage: 'not_tested', description: 'Synthetic claim description', published_values: {reported_zero: 0}, assessment: 'untested', evidence: 'Original evidence scope', limitation: 'No empirical reproduction inferred', proposed_check: 'A separately frozen check', required_inputs: 'Original input bytes', feasibility: 'Not yet executed'}];
  const protocol = {id: 'frozen-protocol', version: 1, stage: 'pilot', locked_at: '2026-11-01T00:00:00Z', sha256: sha, document: {original: true, retained_zero: 0}};
  const meta = {review_definition: 'Synthetic source review definition', label_definitions: {untested: 'No executed evidence for this statement'}, validation: {source_review_counts: {complete: 1, partial: 1}}, costs: {measured_charges_usd: null}, provenance: {original: true}};
  data = {
    delay: {campaign: {id: 'delay-campaign', protocol_sha256: sha, manifest_sha256: 'b'.repeat(64), kernel_commit: 'c'.repeat(40), random_seed: 0, protocol: '# Frozen original protocol\n\nPublished scope remains unchanged.'}, claims, papers: sources},
    leo: {campaign: {protocol: {replication_unit: 'Synthetic whole snapshots', corrections: ['Retained artifact correction'], seed: 0}, limitations: ['Correlated orbital states'], protocol_sha256: sha, artifact_commit: 'c'.repeat(40), provenance: {original: true}}, saturation: {protocol: {scope: 'Separate exploratory saturation', numeric: 0}, protocol_sha256: 'b'.repeat(64)}, claims, papers: sources},
    http2: {campaign: {limitations: ['No operational security conclusion'], costs: {measured_charges_usd: null}}, claims, protocols: [protocol], runs: [{id: 'failed-retained-run', status: 'failed', reason: 'Original failed pilot'}, {id: 'complete-not-a-failure', status: 'complete'}], sources},
    reliable: {meta, claims, protocols: [protocol], controls: [{id: 'original-control', stage: 'pilot', payload: {retained_zero: 0}}], sources},
    ipv6: {meta, claims, protocols: [protocol], controls: [{id: 'failed-control', status: 'failed', reason: 'Original empty-duration failure', payload: {retained_zero: 0}}, {id: 'recorded-control', status: 'complete', reason: null, payload: {original: true}}], sources},
  };
  globalThis.__studyPagesRead = async (studyKey, name, args) => {
    calls.push({studyKey, name, args});
    if (name.endsWith('Campaign')) return studyKey === 'leo' && args.length ? data.leo.saturation : data[studyKey]?.campaign ?? null;
    if (name.endsWith('Claims')) return data[studyKey]?.claims ?? [];
    if (name.endsWith('Papers')) return data[studyKey]?.papers ?? [];
    return data[studyKey];
  };
});
async function page(studyKey, name) {const element = await routes[studyKey][name](); return new JSDOM(renderToStaticMarkup(element)).window.document;}
function text(doc) {return doc.body.textContent;}
function link(doc, label) {return [...doc.querySelectorAll('a')].find(a => a.textContent === label);}

test('all study methods pages preserve their own module navigation and explicitly untested claim scope', async () => {
  for (const studyKey of Object.keys(routes)) {
    const doc = await page(studyKey, 'methods'); assert.ok(doc.querySelector('main')); assert.ok(doc.querySelector('h1'));
    assert.ok(text(doc).includes('Synthetic claim description')); assert.ok(text(doc).includes('No empirical reproduction inferred'));
    const internal = [...doc.querySelectorAll('header a')].filter(a => a.getAttribute('href')?.startsWith('/')); assert.ok(internal.length > 0); assert.ok(internal.every(a => a.getAttribute('href').startsWith('/' + routes[studyKey].studyKey)));
    assert.equal(doc.querySelector('script'), null);
  }
});

test('absent study records never become a completed assessment or fabricated protocol', async () => {
  for (const studyKey of Object.keys(routes)) {
    if (studyKey === 'delay' || studyKey === 'leo') {data[studyKey].campaign = null; data[studyKey].claims = [];}
    else data[studyKey] = null;
    const doc = await page(studyKey, 'methods'); assert.equal(text(doc).includes('Synthetic claim description'), false);
    if (studyKey !== 'delay') assert.match(text(doc), /unavailable|No recorded protocol/);
    assert.equal(doc.querySelector('time'), null);
  }
});

test('delay methods keep published numbers separate from recorded protocol hashes and zero seed', async () => {
  let doc = await page('delay', 'methods'); assert.ok(text(doc).includes('Values reported in the source paper.')); assert.ok(text(doc).includes('reported zero')); assert.ok(text(doc).includes(sha)); assert.ok(doc.querySelector('h1')); assert.ok(text(doc).includes('Published scope remains unchanged.'));
  const values = [...doc.querySelectorAll('dt')]; assert.equal(values.find(node => node.textContent === 'Random seed').nextElementSibling.textContent, '0');
  data.delay.claims[0].published_values = {}; doc = await page('delay', 'methods'); assert.equal(text(doc).includes('Values reported in the source paper.'), false);
});

test('LEO saturation protocol stays separate and optional corrections do not imply new measurements', async () => {
  let doc = await page('leo', 'methods'); assert.ok(text(doc).includes('Separate exploratory saturation')); assert.ok(text(doc).includes('Retained artifact correction')); assert.ok(text(doc).includes('Correlated orbital states'));
  assert.ok(calls.some(c => c.name === 'getLeoCampaign' && c.args.length === 1));
  data.leo.saturation = null; data.leo.campaign.protocol = {replication_unit: 'Whole original snapshots'}; doc = await page('leo', 'methods'); assert.equal(text(doc).includes('Exploratory saturation follow-up'), false); assert.ok(text(doc).includes('Whole original snapshots'));
});

test('HTTP/2 methods retain failed pilots separately and render exact protocol times and unknown charges', async () => {
  const doc = await page('http2', 'methods'); assert.ok(text(doc).includes('failed-retained-run')); assert.ok(text(doc).includes('Original failed pilot')); assert.equal(text(doc).includes('complete-not-a-failure'), false);
  assert.equal(doc.querySelector('time').getAttribute('dateTime'), '2026-11-01T00:00:00Z'); assert.ok(text(doc).includes('"measured_charges_usd": null'));
  assert.equal(link(doc, 'Download protocols, analysis provenance, source inventory and measurements').getAttribute('href'), '/http2-compliance-study/api/results');
});

test('ReliableSketch and IPv6 methods retain finite controls provenance and original failure reasons', async () => {
  const reliableDoc = await page('reliable', 'methods'); assert.ok(text(reliableDoc).includes('original-control')); assert.ok(text(reliableDoc).includes('"retained_zero": 0')); assert.ok(text(reliableDoc).includes('No executed evidence for this statement')); assert.ok(text(reliableDoc).includes('"measured_charges_usd": null'));
  const ipv6Doc = await page('ipv6', 'methods'); assert.ok(text(ipv6Doc).includes('Original empty-duration failure')); assert.ok(text(ipv6Doc).includes('recorded-control')); assert.ok(text(ipv6Doc).includes('Original-byte SHA256: ' + sha)); assert.equal(link(ipv6Doc, 'Current release status (JSON)').getAttribute('href'), '/ipv6-dns-study/api/release');
});

test('literature pages keep missing retrieval and partial review separate from complete review', async () => {
  for (const studyKey of Object.keys(routes)) {
    const doc = await page(studyKey, 'literature'); assert.ok(text(doc).includes('Synthetic cited source 0')); assert.ok(text(doc).includes('Synthetic cited source 1'));
    assert.ok(text(doc).includes('partial') || text(doc).includes('unavailable')); assert.ok(text(doc).includes('Original retained edition') || text(doc).includes('Retained source edition'));
    assert.equal(doc.querySelector('script'), null);
    for (const anchor of [...doc.querySelectorAll('a[target="_blank"]')]) assert.equal(anchor.getAttribute('rel'), 'noreferrer');
  }
});

test('empty bibliography data retains explicit unavailable source coverage in data-backed modules', async () => {
  for (const studyKey of ['http2', 'reliable', 'ipv6']) {data[studyKey] = null; const doc = await page(studyKey, 'literature'); assert.match(text(doc), /unavailable/); assert.equal(doc.querySelector('article'), null);}
  for (const studyKey of ['delay', 'leo']) {data[studyKey].papers = []; const doc = await page(studyKey, 'literature'); assert.equal(doc.querySelector('article'), null); assert.match(text(doc), /0 cited references|0\/0/);}
});

test('delay and LEO bibliography suppress non-web paths and distinguish main paper author artifact and notes', async () => {
  data.delay.papers[0].citation = '1 Synthetic numbered citation'; data.delay.papers[2].source_url = 'file:///private/original.pdf'; data.delay.papers[2].reading_notes = 'private-reading.md';
  data.leo.papers[0].pages = 12; data.leo.papers[2].source_url = 'javascript:alert(1)';
  const delayDoc = await page('delay', 'literature'); assert.ok(text(delayDoc).includes('[0] Synthetic numbered citation')); assert.equal(text(delayDoc).includes('private-reading.md'), false); assert.equal(delayDoc.querySelector('a[href^="file:"]'), null); assert.ok(text(delayDoc).includes('SHA-256 ' + sha));
  const leoDoc = await page('leo', 'literature'); assert.ok(text(leoDoc).includes('[Main paper]')); assert.ok(text(leoDoc).includes('12 pages')); assert.equal(leoDoc.querySelector('a[href^="javascript:"]'), null);
  const ipv6Doc = await page('ipv6', 'literature'); assert.ok(text(ipv6Doc).includes('Author artifact')); assert.ok(text(ipv6Doc).includes('0 pages')); assert.ok(text(ipv6Doc).includes('0 bytes'));
});

test('HTTP/2 bibliography links the adopted HTTPS version and preserves DOI and unavailable fallbacks', async () => {
  data.http2.sources[0].doi = '10.0000/synthetic'; data.http2.sources[2].retrieved_url = 'http://example.test/unadopted';
  const doc = await page('http2', 'literature'); assert.equal(link(doc, 'DOI').getAttribute('href'), 'https://doi.org/10.0000/synthetic');
  assert.equal(doc.querySelector('a[href="http://example.test/unadopted"]'), null); assert.ok(text(doc).includes('No full text retrieved')); assert.ok(text(doc).includes('No reviewed findings.')); assert.ok(text(doc).includes('pages unavailable'));
});
