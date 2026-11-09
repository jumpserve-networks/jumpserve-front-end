import assert from 'node:assert/strict';
import {test} from 'node:test';
import {activityKey, assessmentActivityHeading, parseAssessmentSummary} from '../lib/assessment-notifications.ts';

const counts = () => ({total: 8, finished: 3, reproduced: 2, discrepant: 1, blocked: 1, running: 1, queued: 2, waiting: 1});
const summary = () => ({status: 'running', updated_at: '2026-11-01T00:00:00Z', counts: counts()});

test('notification summaries preserve zero and missing summaries without carrying unprojected fields', () => {
  assert.equal(parseAssessmentSummary(null), null);
  assert.equal(parseAssessmentSummary(undefined), null);
  for (const status of ['running', 'completed', 'completed-with-blockers', 'budget', 'deadline', 'cancelled']) {
    const original = {...summary(), status};
    const parsed = parseAssessmentSummary({...original, private_field: 'synthetic-private', counts: {...original.counts, private_count: 10}});
    assert.deepEqual(parsed, original);
    assert.notEqual(parsed.counts, original.counts);
  }
  const empty = Object.fromEntries(Object.keys(counts()).map(key => [key, 0]));
  assert.deepEqual(parseAssessmentSummary({...summary(), counts: empty}).counts, empty);
});

test('notification status rejects malformed times statuses and every inconsistent progress counter', () => {
  const cases = [dict => {dict.status = 'future';}, dict => {dict.updated_at = null;}, dict => {dict.updated_at = 'invalid';}, dict => {dict.counts = null;}];
  for (const key of Object.keys(counts())) {
    for (const invalid of [-1, 0.5, '1', true, 20001, Number.MAX_SAFE_INTEGER + 1]) cases.push(dict => {dict.counts[key] = invalid;});
  }
  cases.push(dict => {dict.counts.total = 1;});
  cases.push(dict => {dict.counts.finished = 2;});
  cases.push(dict => {dict.counts.queued = 3;});
  for (const change of cases) {
    const value = summary(); change(value);
    assert.throws(() => parseAssessmentSummary(value), /progress could not be verified/);
  }
});

test('notification headings distinguish queued active unavailable and terminal assessments', () => {
  const heading = (phase, status, progress = null) => assessmentActivityHeading({id: 'original-assessment', title: 'Recorded title', phase, status, counts: progress});
  assert.equal(heading('preparing', 'unavailable'), 'Assessment status unavailable');
  assert.equal(heading('preparing', 'preparing'), 'Preparing your paper…');
  assert.equal(heading('assessing', 'submitted'), 'Assessment queued');
  assert.equal(heading('assessing', 'running', {...counts(), running: 0, waiting: 0}), 'Assessment queued');
  for (const progress of [null, {...counts(), queued: 0}, {...counts(), running: 1, waiting: 0}, {...counts(), running: 0, waiting: 1}]) {
    assert.equal(heading('assessing', 'running', progress), 'Assessing your paper…');
  }
  for (const [status, expected] of [['completed', 'Assessment complete'], ['completed-with-blockers', 'Assessment finished with gaps'], ['budget', 'Assessment reached its spending limit'], ['deadline', 'Assessment reached its time limit'], ['cancelled', 'Assessment cancelled'], ['running', 'Assessment needs attention']]) {
    assert.equal(heading('finished', status), expected);
  }
  assert.equal(activityKey('original-assessment', 'assessing'), 'original-assessment:assessing');
});
