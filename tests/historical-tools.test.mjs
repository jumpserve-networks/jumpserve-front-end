import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, lstatSync, readFileSync} from 'node:fs';
import {dirname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

test('historical verification tools retain their exact bytes outside supported entrypoints', () => {
  const manifest = read('archive/historical-tools/manifest.json');
  assert.equal(manifest.version, 'historical-tools-archive-v1');
  assert.match(manifest.source_revision, /^[a-f0-9]{40}$/);
  assert.ok(manifest.files.length > 0);
  const originals = new Set();
  for (const row of manifest.files) {
    assert.equal(row.archived_path, `archive/historical-tools/${row.original_path}`);
    assert.ok(!originals.has(row.original_path)); originals.add(row.original_path);
    const original = resolve(root, row.original_path), archived = resolve(root, row.archived_path);
    assert.ok(original.startsWith(root + sep));
    assert.ok(archived.startsWith(resolve(root, 'archive/historical-tools') + sep));
    assert.equal(existsSync(original), false);
    assert.ok(lstatSync(archived).isFile());
    const raw = readFileSync(archived);
    assert.equal(raw.length, row.bytes);
    assert.equal(createHash('sha256').update(raw).digest('hex'), row.sha256);
  }
  const tools = read('maintained-tools.json');
  assert.equal(tools.version, 'maintained-manual-tools-v1');
  for (const path of tools.manual_programs) {
    assert.ok(!originals.has(path));
    assert.ok(lstatSync(resolve(root, path)).isFile(), path);
  }
});
