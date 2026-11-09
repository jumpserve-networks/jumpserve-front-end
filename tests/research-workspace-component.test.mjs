import './support/dom.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {RECORD_KINDS} from '../lib/research-workflow.ts';

globalThis.__workspaceReact = React;
const replacements = {
  'next/link': 'export default function Link({children,prefetch,...props}){return globalThis.__workspaceReact.createElement("a",props,children);}',
  'next/navigation': 'export const useRouter=()=>globalThis.__workspaceRouter;',
  '@/lib/research-workflow-api': 'export const researchRequest=(...args)=>globalThis.__workspaceRequest(...args);',
  '@/app/components/user-preferences': 'export const useDateTime=()=>value=>"Recorded "+value;',
  './paper-uploads-provider': 'export const usePaperUploads=()=>globalThis.__workspaceUploads;',
  './paper-bibliography': 'export const usePaperBibliography=value=>{globalThis.__workspaceBibliographyInput=value;return globalThis.__workspaceBibliography;};export const PaperAuthors=props=>{globalThis.__workspaceAuthors.push(props);return globalThis.__workspaceReact.createElement("p",null,props.loading?"Loading authors":props.authors?.join(", ")??"Authors missing");};',
};
for (const [module, name] of Object.entries({'study-panel': 'StudyPanel', 'claim-queue': 'ClaimQueue', 'preparation': 'StudyPreparation', 'paper-preparation': 'PaperPreparation'})) {
  replacements['@/app/components/research-workflow/' + module] = `export function ${name}(props){globalThis.__workspaceChildren.${name}=props;return globalThis.__workspaceReact.createElement('p',null,'${name} boundary');}`;
}
const hooks = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {PaperIntake, OwnerStudies, StudyWorkspace} = await import('../app/components/research-workflow/workspace.tsx'); hooks.deregister();
const ID = '11111111-1111-4111-8111-111111111111', STAMP = '2026-11-07T00:00:00Z';
const uid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const hash = text => createHash('sha256').update(text).digest('hex');
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const originalFormData = globalThis.FormData;
let snapshot, studies, request, calls, replacementsSeen;
function fixture() {
  const records = Object.fromEntries(RECORD_KINDS.map(kind => [kind, []]));
  const row = (id, fields) => ({id: uid(id), study_id: ID, created_at: STAMP, ...fields});
  records.sources = [row(1, {citation: 'Original source'}), row(2, {})];
  records.claims = [row(3, {description: 'Original sourced claim'})];
  records.protocols = [row(4, {version: 3, frozen_at: STAMP})];
  records.campaigns = [row(5, {title: 'Numerical campaign', adapter: 'matched-numeric-v1'}), row(6, {title: 'Other experiment', adapter: 'different-adapter'})];
  records.assessments = [row(7, {claim_id: uid(3), label: 'untested'})];
  records.gaps = [row(8, {claim_id: uid(3)})];
  records.reviews = [row(9, {scope: 'scientific', status: 'passed', limitations: 'Passed scientific scope'}), row(10, {scope: 'software', status: 'passed', limitations: 'Passed software scope'}), row(11, {scope: 'scientific', status: 'conditional', limitations: 'Conditional review'}), row(12, {scope: 'model-evaluation', status: 'passed', limitations: 'Other review scope'})];
  return {study: {id: ID, title: 'Retained synthetic assessment', study_kind: 'paper', domain: 'Networks', scope: 'Numerical reproduction', created_at: STAMP, paper_url: null}, access: 'owner-draft', records, coverage: Object.fromEntries(RECORD_KINDS.map(kind => [kind, records[kind].length]))};
}
beforeEach(() => {
  snapshot = fixture(); studies = [snapshot.study]; calls = []; replacementsSeen = [];
  request = async (path, options) => options.method === 'POST' ? path.endsWith('/runs') ? {run: {status: 'complete', reason: null}} : {} : path === '/studies?mine=1' ? {studies} : structuredClone(snapshot);
  globalThis.__workspaceRequest = (path, options = {}) => {calls.push({path, options, body: options.body ? JSON.parse(options.body) : undefined}); return request(path, options);};
  globalThis.__workspaceRouter = {replace: value => replacementsSeen.push(value)};
  globalThis.__workspaceChildren = {}; globalThis.__workspaceBibliography = {}; globalThis.__workspaceAuthors = [];
  globalThis.__workspaceUploads = {signedIn: true, uploads: [], error: '', persistenceError: '', enqueue: () => {}, refresh: async () => {}, retry: () => {}};
});
afterEach(() => {cleanup(); globalThis.FormData = originalFormData;});
const writes = () => calls.filter(call => call.options.method === 'POST');
const show = async (props = {}) => {await act(async () => {render(React.createElement(StudyWorkspace, {studyId: ID, view: 'overview', ...props}));}); assert.ok(screen.getByRole('heading', {name: snapshot.study.title}));};
const open = id => {const details = document.getElementById(id); details.open = true; return within(details);};
const change = (name, value) => fireEvent.change(screen.getByLabelText(name, {exact: true}), {target: {value}});
async function submit(button) {await act(async () => {fireEvent.submit(screen.getByRole('button', {name: button, exact: true}).closest('form'));});}
async function select(label, option) {
  await act(async () => {fireEvent.click(screen.getByRole('combobox', {name: label, exact: true}));});
  await act(async () => {const item = screen.getByRole('option', {name: option, exact: true}); fireEvent.pointerDown(item, {pointerType: 'mouse', button: 0}); fireEvent.click(item);});
}
function intakeFiles(files) {
  // JSDOM does not connect its native FormData to an overridden input.files.
  // Keep this boundary explicit; upload-provider transport has separate tests.
  globalThis.FormData = class SelectedFiles {constructor(form) {this.form = form;} getAll(name) {assert.equal(name, 'paper_pdf'); return [...this.form.querySelector('[name=paper_pdf]').files];}};
  fireEvent.change(screen.getByLabelText('Paper PDF'), {target: {files}});
}

test('paper intake enqueues original nonempty files, resets the form and preserves validation failures', () => {
  const enqueued = []; globalThis.__workspaceUploads.enqueue = files => enqueued.push(files); render(React.createElement(PaperIntake));
  const form = screen.getByRole('form', {name: 'Upload paper for review'}); let resets = 0; form.addEventListener('reset', () => resets++);
  const first = new File(['first'], 'first.pdf'), second = new File(['second'], 'second.pdf'); intakeFiles([first, second]); fireEvent.submit(form);
  assert.deepEqual(enqueued, [[first, second]]); assert.equal(resets, 1);
  for (const files of [[], [new File([], 'empty.pdf')], ['not a file']]) {intakeFiles(files); fireEvent.submit(form); assert.match(screen.getByRole('alert').textContent, /Choose one or more PDF papers/);}
  assert.equal(enqueued.length, 1); assert.equal(resets, 1);
});

test('paper intake reports provider errors and retries status and individual failed uploads', () => {
  let refreshed = 0; const retries = []; Object.assign(globalThis.__workspaceUploads, {signedIn: false, error: 'Status unavailable', persistenceError: 'Local persistence unavailable', refresh: () => refreshed++, retry: id => retries.push(id), uploads: [
    {id: 'q', title: 'Queued', phase: 'queued', message: 'Waiting for upload'}, {id: 'u', title: 'Uploading', phase: 'uploading', message: 'Sending original bytes'},
    {id: 'p', title: 'Preparing', phase: 'preparing'}, {id: 'r', title: 'Ready', phase: 'ready'}, {id: 'c', title: 'Confirmed', phase: 'confirmed'},
    {id: 'f', title: 'Failed', phase: 'failed', retryable: true, message: 'Original upload failed'}, {id: 'n', title: 'Needs attention', phase: 'failed'},
  ]});
  const mounted = render(React.createElement(PaperIntake)); assert.equal(screen.getByRole('button', {name: 'Checking sign-in…'}).disabled, true);
  assert.ok(screen.getByText('Waiting for upload')); assert.ok(screen.getByText('Sending original bytes')); assert.ok(screen.getByText('Ready to review')); assert.ok(screen.getByText('Assessment started')); assert.ok(screen.getByText('Paper preparation needs attention.'));
  assert.equal(screen.getByRole('link', {name: 'Review paper'}).getAttribute('href'), '/research-verification/new-assessment/r');
  assert.equal(screen.getAllByRole('link', {name: 'View paper preparation'}).length, 2);
  fireEvent.click(screen.getByRole('button', {name: 'Retry status'})); fireEvent.click(screen.getByRole('button', {name: 'Retry upload'})); assert.equal(refreshed, 1); assert.deepEqual(retries, ['f']);
  globalThis.__workspaceUploads.error = ''; mounted.rerender(React.createElement(PaperIntake)); assert.ok(screen.getByText(/Local persistence unavailable/));
});

test('paper intake retains an enqueue error and a non-Error failure without resetting selected input', () => {
  render(React.createElement(PaperIntake)); intakeFiles([new File(['bytes'], 'paper.pdf')]); const form = screen.getByRole('form', {name: 'Upload paper for review'});
  globalThis.__workspaceUploads.enqueue = () => {throw Error('Original queue unavailable');}; fireEvent.submit(form); assert.ok(screen.getByText('Original queue unavailable'));
  globalThis.__workspaceUploads.enqueue = () => {throw null;}; fireEvent.submit(form); assert.ok(screen.getByText('The operation could not complete. Your input is retained.'));
});

test('owner studies filters paper and idea pathways and resolves author fallbacks without mixing routes', async () => {
  studies = [snapshot.study, {...snapshot.study, id: uid(20), title: 'Explicit paper authors', authors: ['Recorded Author']}, {...snapshot.study, id: uid(21), title: 'Ready paper', paper_review_status: 'ready'}, {...snapshot.study, id: uid(22), study_kind: 'idea', title: 'Private idea'}];
  globalThis.__workspaceBibliography = {[ID]: {authors: ['Bibliography Author']}};
  await act(async () => {render(React.createElement(OwnerStudies));}); assert.ok(screen.getByText('Bibliography Author')); assert.ok(screen.getByText('Recorded Author')); assert.ok(screen.getByText('Loading authors')); assert.equal(screen.queryByText('Private idea'), null);
  assert.equal(screen.getByRole('link', {name: 'Ready paper'}).getAttribute('href'), '/research-verification/new-assessment/' + uid(21)); assert.equal(globalThis.__workspaceBibliographyInput.length, 3);
  cleanup(); await act(async () => {render(React.createElement(OwnerStudies, {kind: 'idea'}));}); assert.equal(screen.queryByText('Recorded Author'), null); assert.equal(globalThis.__workspaceBibliographyInput, undefined); assert.equal(screen.getByRole('link', {name: 'Private idea'}).getAttribute('href'), '/research-ideas/ideas/' + uid(22));
});

for (const kind of ['paper', 'idea']) test('owner studies exposes the empty ' + kind + ' pathway after a bounded read', async () => {
  studies = []; await act(async () => {render(React.createElement(OwnerStudies, {kind}));});
  assert.ok(screen.getByText(new RegExp('You have no ' + (kind === 'paper' ? 'paper assessment' : 'idea') + ' drafts yet'))); assert.ok(screen.getByRole('link', {name: kind === 'paper' ? 'Assess a paper' : 'Develop an idea'})); assert.equal(calls[0].path, '/studies?mine=1');
});

test('owner reads abort on unmount and report definite failures without accepting late responses', async () => {
  const pending = deferred(); request = () => pending.promise; const mounted = render(React.createElement(OwnerStudies)); assert.ok(screen.getByText('Loading your paper assessments…')); const signal = calls[0].options.signal; mounted.unmount(); assert.equal(signal.aborted, true); await act(async () => pending.resolve({studies})); assert.equal(document.body.textContent, '');
  request = async () => {throw Error('Owner history unavailable');}; await act(async () => render(React.createElement(OwnerStudies, {kind: 'idea'}))); assert.equal(screen.getByRole('alert').textContent, 'Owner history unavailable');
  cleanup(); const failed = deferred(); request = () => failed.promise; const other = render(React.createElement(OwnerStudies, {kind: 'idea'})); assert.ok(screen.getByText('Loading your ideas…')); other.unmount(); await act(async () => failed.reject(Error('Cancelled transport'))); assert.equal(document.body.textContent, '');
});

test('workspace binds child views to the validated owner snapshot and reloads from its original study', async () => {
  await show(); const children = globalThis.__workspaceChildren; assert.equal(children.StudyPanel.snapshot.study.id, ID); assert.equal(children.StudyPanel.view, 'overview'); assert.equal(children.StudyPanel.basePath, '/research-verification/workspace/' + ID); assert.equal(children.PaperPreparation.studyId, ID);
  snapshot.study.title = 'Reloaded immutable records'; await act(async () => children.PaperPreparation.onSaved()); assert.ok(screen.getByRole('heading', {name: 'Reloaded immutable records'}));
  snapshot.study.title = 'Evidence reload'; await act(async () => globalThis.__workspaceChildren.ClaimQueue.onEvidenceChanged()); assert.ok(screen.getByRole('heading', {name: 'Evidence reload'})); assert.ok(calls.every(call => call.path === '/studies/' + ID));
});

test('workspace redirects a mismatched pathway and keeps idea and claim-design preparation distinct', async () => {
  snapshot.study.study_kind = 'idea'; await act(async () => render(React.createElement(StudyWorkspace, {studyId: ID, view: 'claims'}))); assert.deepEqual(replacementsSeen, ['/research-ideas/workspace/' + ID + '?view=claims']); assert.ok(screen.getByText('Loading the owner-scoped assessment…')); assert.deepEqual(globalThis.__workspaceChildren, {});
  cleanup(); await show({kind: 'idea'}); assert.equal(globalThis.__workspaceChildren.PaperPreparation, undefined); assert.equal(screen.getByRole('link', {name: 'Return to idea planning and fresh reviews'}).getAttribute('href'), '/research-ideas/ideas/' + ID);
  cleanup(); globalThis.__workspaceChildren = {}; snapshot.study.study_kind = 'paper'; snapshot.study.claim_design = true; await show(); assert.equal(globalThis.__workspaceChildren.PaperPreparation, undefined); assert.equal(screen.getByRole('link', {name: 'Return to experiment design and fresh reviews'}).getAttribute('href'), '/research-verification/experiment-design/' + ID);
});

test('workspace rejects malformed coverage and ignores successful and failed reads after unmount', async () => {
  snapshot.coverage.sources = 999; await act(async () => render(React.createElement(StudyWorkspace, {studyId: ID, view: 'overview'}))); assert.match(screen.getByRole('alert').textContent, /Incomplete or ambiguous research sources coverage/); assert.deepEqual(globalThis.__workspaceChildren, {});
  for (const reject of [false, true]) {cleanup(); const pending = deferred(); request = () => pending.promise; const mounted = render(React.createElement(StudyWorkspace, {studyId: ID, view: 'overview'})); const signal = calls.at(-1).options.signal; mounted.unmount(); assert.equal(signal.aborted, true); await act(async () => reject ? pending.reject('Cancelled') : pending.resolve(fixture())); assert.equal(document.body.textContent, '');}
});

test('download preserves the exact current snapshot and revokes the generated object URL', async t => {
  await show(); let blob; let downloaded; const revoked = [];
  t.mock.method(URL, 'createObjectURL', value => {blob = value; return 'blob:http://localhost/retained-draft';}); t.mock.method(URL, 'revokeObjectURL', value => revoked.push(value));
  t.mock.method(window.HTMLAnchorElement.prototype, 'click', function () {downloaded = {href: this.href, filename: this.download};});
  t.mock.timers.enable({apis: ['setTimeout']}); fireEvent.click(screen.getByRole('button', {name: 'Download draft JSON'})); assert.equal(blob.type, 'application/json'); assert.deepEqual(JSON.parse(await blob.text()), snapshot); assert.equal(downloaded.filename, 'research-draft-' + ID + '.json'); assert.deepEqual(revoked, []); t.mock.timers.tick(1000); assert.deepEqual(revoked, ['blob:http://localhost/retained-draft']);
});

for (const kind of ['sources', 'claims', 'configurations', 'campaigns', 'claim_checks', 'assessments', 'gaps', 'reviews']) test('record editor preserves typed ' + kind + ' fields and original relation identities', async () => {
  await show(); open('research-records'); if (kind !== 'sources') await select('Record to add', kind[0].toUpperCase() + kind.slice(1).replaceAll('_', ' '));
  if (kind === 'sources') {change('Citation', 'Exact original citation'); change('Byte count', '17'); change('Original-byte SHA256', 'a'.repeat(64)); change('Retrieval attempts (JSON)', '[{"status":"retained"}]');}
  if (kind === 'claims') {change('Description', 'New sourced finding'); change('Priority', '0'); change('Scope (JSON)', '{"conditions":"Fixed"}'); await select('Kind of claim', 'algorithm');}
  if (kind === 'configurations') {change('Identity', 'Exact configuration'); change('Details (JSON)', '{"latency_ms":0}');}
  if (kind === 'campaigns') {change('Title', 'Separate prospective campaign'); change('Planned units', '2'); await select('Stage', 'pilot'); await select('Follow-up of campaign', 'Numerical campaign');}
  if (kind === 'claim_checks') {await select('Applicability', 'inapplicable'); change('Rationale', 'Retained scope mismatch');}
  if (kind === 'assessments') {await select('Previous version', 'Recorded ' + STAMP + ' · untested'); await select('Assessment label', 'inconclusive'); change('Tested conditions (JSON)', '{"scope":"bounded"}');}
  if (kind === 'gaps') {change('Estimated cost (USD)', '0'); await select('Status', 'blocked'); await select('Previous version', 'Recorded ' + STAMP + ' · ' + uid(8));}
  if (kind === 'reviews') {await select('Scope', 'software'); await select('Status', 'passed'); change('Review judgments and check results (JSON)', '{"tests_passed":true}');}
  await submit('Preserve new record'); const saved = writes()[0]; assert.equal(saved.path, '/studies/' + ID + '/records'); assert.equal(saved.body.kind, kind); assert.match(saved.body.record.id, /^[\da-f-]{36}$/); assert.ok(screen.getByText('New record preserved. Earlier records remain unchanged.')); assert.equal(calls.length, 3);
  const row = saved.body.record;
  if (kind === 'sources') {assert.equal(row.source_url, null); assert.equal(row.retrieved_url, null); assert.equal(row.byte_count, 17); assert.deepEqual(row.retrieval_attempts, [{status: 'retained'}]);}
  if (kind === 'claims') {assert.equal(row.source_id, uid(1)); assert.equal(row.priority, 0); assert.deepEqual(row.scope, {conditions: 'Fixed'}); assert.equal(row.claim_type, 'algorithm');}
  if (kind === 'configurations') assert.deepEqual(row.details, {latency_ms: 0});
  if (kind === 'campaigns') {assert.equal(row.protocol_id, uid(4)); assert.equal(row.followup_of, uid(5)); assert.equal(row.planned_units, 2);}
  if (kind === 'claim_checks') {assert.equal(row.claim_id, uid(3)); assert.equal(row.campaign_id, uid(5)); assert.equal(row.applicability, 'inapplicable');}
  if (kind === 'assessments') {assert.equal(row.supersedes_id, uid(7)); assert.equal(row.campaign_id, null); assert.equal(row.label, 'inconclusive');}
  if (kind === 'gaps') {assert.equal(row.supersedes_id, uid(8)); assert.equal(row.assessment_id, null); assert.equal(row.estimated_cost_usd, 0);}
  if (kind === 'reviews') {assert.equal(row.scope, 'software'); assert.deepEqual(row.judgments, {tests_passed: true});}
});

test('record retries retain the original id and fields until an edit and malformed JSON never reaches the API', async () => {
  const original = request; let fail = true; request = (path, options) => options.method === 'POST' && fail ? Promise.reject(Error('Write acknowledgement unavailable')) : original(path, options);
  await show(); open('research-records'); change('Citation', 'Retained owner input'); await submit('Preserve new record'); assert.ok(screen.getByText('Write acknowledgement unavailable')); assert.equal(screen.getByLabelText('Citation').value, 'Retained owner input'); const first = writes()[0].body;
  fail = false; await submit('Preserve new record'); assert.deepEqual(writes()[1].body, first); change('Citation', 'Corrected owner input'); await submit('Preserve new record'); assert.notEqual(writes()[2].body.record.id, first.record.id);
  await select('Record to add', 'Claims'); change('Scope (JSON)', '{'); await submit('Preserve new record'); assert.equal(writes().length, 3); assert.match(within(document.getElementById('research-records')).getByRole('status').textContent, /JSON/);
});

test('a new workspace has no implicit source, protocol, campaign or claim relation', async () => {
  for (const kind of RECORD_KINDS) {snapshot.records[kind] = []; snapshot.coverage[kind] = 0;}
  await show(); open('research-records'); await select('Record to add', 'Claims'); assert.match(screen.getByRole('combobox', {name: 'Source', exact: true}).textContent, /Select a record/);
  await select('Record to add', 'Campaigns'); assert.match(screen.getByRole('combobox', {name: 'Frozen protocol', exact: true}).textContent, /Select a record/);
  await select('Record to add', 'Claim checks'); assert.match(screen.getByRole('combobox', {name: 'Claim', exact: true}).textContent, /Select a record/); assert.match(within(document.getElementById('research-records')).getByRole('combobox', {name: 'Campaign', exact: true}).textContent, /Select a record/); assert.deepEqual(writes(), []);
});

test('protocol freezing preserves initial and amended documents and retries the original amendment', async () => {
  await show(); open('research-protocol'); const document = {questions: ['Prospective test'], resource_limits: {estimated_cost_usd: null}}; change('Protocol document (JSON)', JSON.stringify(document)); await submit('Freeze protocol version');
  assert.deepEqual(writes()[0].body.document, document); assert.equal(writes()[0].body.version, 1); assert.equal(writes()[0].body.supersedes_id, null); assert.equal(writes()[0].body.amendment_reason, null); assert.ok(screen.getByText('Protocol version frozen.'));
  await select('Previous protocol', 'Version 3 · ' + STAMP); change('Amendment rationale', 'Separate the sensitivity check'); const original = request; request = (path, options) => options.method === 'POST' ? Promise.reject('Unconfirmed write') : original(path, options);
  await submit('Freeze protocol version'); const amendment = writes()[1].body; assert.equal(amendment.version, 4); assert.equal(amendment.supersedes_id, uid(4)); assert.equal(amendment.amendment_reason, 'Separate the sensitivity check'); assert.ok(screen.getByText('The operation could not complete. Your input is retained.'));
  request = original; await submit('Freeze protocol version'); assert.deepEqual(writes()[2].body, amendment); change('Protocol document (JSON)', '{'); await submit('Freeze protocol version'); assert.equal(writes().length, 3);
});

test('campaign execution preserves exact input bytes, hashes and original request identities across retries', async () => {
  await show(); open('research-runner'); assert.equal(screen.getByRole('button', {name: 'Run and preserve comparison'}).disabled, true); await select('Campaign', 'Numerical campaign'); const raw = ' {"published":[], "observed":[]}\n'; change('Original input text', raw);
  fireEvent.click(screen.getByRole('button', {name: 'Calculate original-input SHA256'})); await waitFor(() => assert.ok(screen.getByText(new RegExp(hash(raw)))));
  const original = request; let fail = true; request = (path, options) => options.method === 'POST' && fail ? Promise.reject(Error('Original run acknowledgement missing')) : original(path, options);
  await submit('Run and preserve comparison'); const first = writes()[0].body; assert.equal(first.campaign_id, uid(5)); assert.equal(first.raw_input, raw); assert.equal(screen.getByLabelText('Original input text').value, raw);
  fail = false; await submit('Run and preserve comparison'); assert.deepEqual(writes()[1].body, first); assert.ok(screen.getByText('Run preserved: complete. Numerical results require a claim-specific evidence review.'));
  change('Original input text', raw + ' '); assert.equal(screen.queryByText(/SHA256:/), null); await submit('Run and preserve comparison'); assert.notEqual(writes()[2].body.request_id, first.request_id);
});

test('campaign files preserve BOM and whitespace and reject oversized or invalid UTF-8 input before execution', async () => {
  await show(); open('research-runner'); const input = screen.getByLabelText('Original UTF-8 JSON file'); const text = '\uFEFF {"published":[]}\n'; const file = new File([text], 'input.json');
  await act(async () => fireEvent.change(input, {target: {files: [file]}})); await waitFor(() => assert.ok(screen.getByText(new RegExp(hash(text))))); assert.equal(screen.getByLabelText('Original input text').value, text);
  await act(async () => fireEvent.change(input, {target: {files: []}})); assert.equal(screen.getByLabelText('Original input text').value, text);
  await act(async () => fireEvent.change(input, {target: {files: [new File(['x'.repeat(256001)], 'oversize.json')]}})); assert.ok(screen.getByText(/File exceeds the interactive 256 KB/)); assert.equal(screen.getByLabelText('Original input text').value, text);
  await act(async () => fireEvent.change(input, {target: {files: [new File([new Uint8Array([255])], 'invalid.json')]}})); await waitFor(() => assert.ok(screen.getByText(/encoded data was not valid/i))); assert.equal(screen.getByLabelText('Original input text').value, text); assert.deepEqual(writes(), []);
});

test('publication uses only passed scoped reviews and keeps the same request until confirmed or edited', async () => {
  await show(); open('research-publication'); await select('scientific review', 'Recorded ' + STAMP + ' · Passed scientific scope'); await select('software review', 'Recorded ' + STAMP + ' · Passed software scope'); change('Publication rationale and scope', 'Bounded reviewed snapshot');
  const original = request; request = (path, options) => options.method === 'POST' ? Promise.reject(Error('Publication acknowledgement unknown')) : original(path, options); await submit('Publish reviewed snapshot'); const first = writes()[0].body;
  assert.equal(first.scientific_review_id, uid(9)); assert.equal(first.software_review_id, uid(10)); assert.equal(first.reason, 'Bounded reviewed snapshot'); assert.ok(screen.getByText('Publication acknowledgement unknown'));
  request = original; await submit('Publish reviewed snapshot'); assert.deepEqual(writes()[1].body, first); assert.ok(screen.getByText('A fixed snapshot is now public. Later records remain private until separately reviewed and published.'));
  change('Publication rationale and scope', 'New reviewed rationale'); await submit('Publish reviewed snapshot'); assert.notEqual(writes()[2].body.request_id, first.request_id);
});
