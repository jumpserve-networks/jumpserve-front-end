import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {privateDirectory,privateJSON} from '../scripts/lib/paper-evaluation-store.mjs';
import {qualitySource,qualityResponse,passReview} from './support/paper-quality-fixture.mjs';
import {qualityReviewRequest} from '../lib/paper-quality-model.ts';
const args=['--import','./scripts/lib/register-typescript.mjs','scripts/evaluate-paper-quality.mjs'];
const run=(options=[])=>spawnSync(process.execPath,[...args,...options],{encoding:'utf8',timeout:10000,env:{...process.env,OPENAI_API_KEY:'synthetic-offline-key'}});
test('quality evaluation defaults to offline fixtures and replays only source-bound retained evidence',async()=>{
 let result=run();assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).model_calls,0);
 const name='unit-quality-'+randomUUID(),directory=join(process.cwd(),'.test-artifacts/paper-quality-evaluations',name),source=qualitySource(4),saved={source,request:qualityReviewRequest(source,'file-fixture'),response:qualityResponse(passReview(),source)};await privateDirectory(directory);await privateJSON(join(directory,'run.json'),saved);
 result=run(['--replay',name]);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).approved,true);assert.equal(JSON.parse(result.stdout).model_calls,0);
 saved.source.candidate.setup.notes+=' Tampered';await privateJSON(join(directory,'run.json'),saved);result=run(['--replay',name]);assert.equal(result.status,1);assert.match(result.stderr,/frozen reviewer source identity/);
});
test('a lost quality submission cannot be repeated by rerunning the live command',async()=>{
 const name='unit-quality-uncertain-'+randomUUID(),directory=join(process.cwd(),'.test-artifacts/paper-quality-evaluations',name),source=qualitySource(3),saved={source,status:'submitting',token:'original-request'};await privateDirectory(directory);await privateJSON(join(directory,'run.json'),saved);const input=join(directory,'source.json');await privateJSON(input,source);
 const result=run(['--live','--run',name,'--from-source',input]);assert.equal(result.status,1);assert.match(result.stderr,/will not be repeated/);assert.deepEqual(JSON.parse(await readFile(join(directory,'run.json'),'utf8')),saved);
});
