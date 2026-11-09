import {readdirSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {root, checkReport} from './coverage-inventory.mjs';
const args = process.argv.slice(2);
if (args.some(arg => !['--check', '--all-sources'].includes(arg))) throw new Error('Only --check and --all-sources are supported.');
const includeOperations = args.includes('--all-sources');
const directory = includeOperations ? 'coverage/all-sources' : 'coverage/unit';
const config = JSON.parse(readFileSync(new URL('../.c8rc.json', import.meta.url), 'utf8'));
const options = includeOperations ? [...config.include, 'scripts/**/*.mjs'].map(glob => '--include=' + glob) : [];
const tests = readdirSync(new URL('.', import.meta.url)).filter(name => name.endsWith('.test.mjs')).sort().map(name => 'tests/' + name);
const result = spawnSync(process.execPath, ['node_modules/c8/bin/c8.js', '--reports-dir=' + directory, '--temp-directory=' + directory + '/tmp', ...options, process.execPath, '--import', './tests/support/tsx-loader.mjs', '--test', ...tests], {cwd: root, stdio: 'inherit'});
if (result.status !== 0) process.exitCode = result.status ?? 1;
else {
  const report = checkReport(directory, includeOperations);
  console.log(JSON.stringify({scope: includeOperations ? 'all-maintained-sources' : 'application-runtime', inventory_valid: report.valid, target_met: report.complete, files: report.files, missing_files: report.missing, errors: report.errors, totals: report.totals}));
  process.exitCode = !report.valid ? 1 : args.includes('--check') && !report.complete ? 2 : 0;
}
