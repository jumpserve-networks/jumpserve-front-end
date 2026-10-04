import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeHttp2, csvCell } from '../lib/http2-study.ts';
test('recorded quantities preserve missing values, unsigned error codes and opaque evidence', () => {
  const value = { error_code: '4294966393', wall_seconds: null, version: '2.4.63', protocol: { metrics: { error_code: 'dimensionless integer' } }, document: { planned: 'descriptive census' } };
  assert.deepEqual(normalizeHttp2(value), { ...value, error_code: 4294966393 });
  for (const error_code of ['', 'NaN', 'Infinity']) assert.throws(() => normalizeHttp2({ error_code }), /Invalid recorded/);
});
test('CSV distinguishes missing and zero and prevents spreadsheet interpretation', () => {
  assert.equal(csvCell(null), ''); assert.equal(csvCell(0), '"0"');
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell(-1), '"-1"');
});
