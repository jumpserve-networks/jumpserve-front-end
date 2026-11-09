// Fixed-purpose coverage inventory; no arbitrary commands or source execution.
import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCoverage} from './coverage-policy.mjs';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function walk(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return ['tests', 'node_modules', '__pycache__'].includes(entry.name) ? [] : walk(path);
    return entry.isFile() && [".ts",".tsx",".mjs"].includes(extname(entry.name)) &&
      !entry.name.endsWith('.d.ts') && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}
export function sourceFiles(includeOperations = false) {
  const files = (includeOperations ? ["app","lib","scripts"] : ["app","lib"]).flatMap(directory => walk(resolve(root, directory)));
  files.push(...readdirSync(root).filter(name => name === 'proxy.ts' || /\.config\.(?:ts|mjs)$/.test(name)).map(name => resolve(root, name)));
  return files.sort();
}
export function checkReport(directory = 'coverage/unit', includeOperations = false) {
  const summary = JSON.parse(readFileSync(resolve(root, directory, 'coverage-summary.json'), 'utf8'));
  const result = validateCoverage(summary, sourceFiles(includeOperations));
  writeFileSync(resolve(root, directory, 'gate.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

