import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { invokeTool } from '../scripts/lib/agents-api-paper-pilot.mjs';
import { qualitySource } from './support/paper-quality-fixture.mjs';

function fixture() {
  const source = qualitySource(2);
  return { inputs: { source }, candidate: structuredClone(source.candidate), platform_issues: [] };
}
const call = (name, args = {}) => ({ name, arguments: args });

test('Agents API pilot can edit supported text while preserving source evidence and scientific criteria', () => {
  const saved = fixture(), original = structuredClone(saved.candidate), id = original.breakdown.sections.access[0].id;
  const result = invokeTool(saved, call('patch_detail', { section: 'access', detail_id: id, field: 'description', value: 'Use two Linux hosts with a single TCP stream, as described in the paper.' }));
  assert.equal(result.saved, true);
  const expected = structuredClone(original);
  expected.breakdown.sections.access[0].description = saved.candidate.breakdown.sections.access[0].description;
  assert.deepEqual(saved.candidate, expected);
  assert.equal(invokeTool(saved, call('run_validator')).passed, true);
});

test('Agents API pilot rejects arbitrary execution, unknown identities and frozen-criterion edits', () => {
  const saved = fixture(), before = structuredClone(saved);
  for (const action of [
    call('execute_sql', { query: 'delete from assessments' }),
    call('run_shell', { command: 'example' }),
    call('patch_detail', { section: 'validate', detail_id: saved.candidate.breakdown.sections.validate[0].id, field: 'criterion.target', value: 'A weaker threshold' }),
    call('patch_detail', { section: 'access', detail_id: 'another-assessment:access:0', field: 'description', value: 'Other owner' }),
  ]) assert.throws(() => invokeTool(saved, action));
  assert.deepEqual(saved, before);
});

test('Agents API pilot retains a valid candidate when a proposed repair violates application bounds', () => {
  const saved = fixture(), before = structuredClone(saved.candidate);
  const item = saved.candidate.breakdown.sections.validate[0];
  const result = invokeTool(saved, call('patch_detail', { section: 'validate', detail_id: item.id, field: 'criterion.tolerance', value: 'x'.repeat(201) }));
  assert.equal(result.saved, false);
  assert.equal(result.checks.passed, false);
  assert.deepEqual(saved.candidate, before);
});

test('Agents API pilot records platform diagnoses without changing the candidate or approving it', () => {
  const saved = fixture(), before = structuredClone(saved.candidate);
  const result = invokeTool(saved, call('record_platform_issue', { location: 'Storage transform', explanation: 'Review must use the correct representation.', evidence: 'The raw and stored dependency formats differ.' }));
  assert.equal(result.recorded, true);
  assert.equal(result.code_changed, false);
  assert.equal(saved.platform_issues.length, 1);
  assert.deepEqual(saved.candidate, before);
});

test('Agents API evaluator defaults to help and rejects mixed modes without provider access', () => {
  const run = args => spawnSync(process.execPath, ['scripts/evaluate-agents-api.mjs', ...args], { encoding: 'utf8', timeout: 10000, env: { ...process.env, OPENAI_API_KEY: 'offline-synthetic-key' } });
  let result = run([]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Replay is offline/);
  result = run(['--probe', '--live', '--run', 'offline-contract-test']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exactly one/);
  result = run(['--live', '--run', '../outside']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /bounded report name/);
});
