import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {extractPaperPDF} from '../lib/paper-intake-pdf.ts';
import {sha256} from '../lib/paper-intake-model.ts';
import {stepCommandsRequest} from '../lib/paper-step-commands-model.ts';
import {stepPlan,stepBreakdown,stepCommandFixture} from './support/step-command-fixture.mjs';
import {privateDirectory,privateJSON} from '../scripts/lib/paper-evaluation-store.mjs';
import {SYNTHETIC_PAPERS,reviewedSyntheticCase,syntheticQualityChecks} from '../scripts/lib/synthetic-paper-benchmark-cases.mjs';

for(const spec of SYNTHETIC_PAPERS){
 test(`${spec.id}: reviewed benchmark citations match actual PDF pages`,async()=>{
  const paper=await extractPaperPDF(new Uint8Array(await readFile(new URL('../pdfs/synthetic_papers/'+spec.file,import.meta.url))));
  const c=reviewedSyntheticCase(spec.id,paper);
  const citations=[...c.breakdown.provenance.citations,...Object.values(c.breakdown.sections).flatMap(items=>items.flatMap(i=>i.citations)),...c.breakdown.implementation_choices.flatMap(i=>i.citations)];
  for(const citation of citations)assert.ok(paper.pages[citation.page-1].text.includes(citation.quote),citation.quote);
  assert.equal(c.breakdown.sections.validate.filter(i=>i.kind==='claim').length,3);
  const unresolved=c.breakdown.sections.validate.filter(i=>i.criterion?.acceptance==='needs_definition');
  assert.deepEqual(unresolved.map(i=>i.label),spec.id==='SNC-NEG-001'?['H1','H3']:[]);
  for(const ref of c.command_refs){const request=stepCommandsRequest('00000000-0000-4000-8000-000000000001',1,ref,c.plan,c.breakdown);assert.equal(JSON.parse(request.input).action_ref,ref);assert.deepEqual(request.text.format.schema.properties.actions.required,[ref]);}
 });
}
test('benchmark rubric distinguishes incomplete scope and copied fabricated values',()=>{
 const c={id:'SNC-MIX-002'};
 assert.ok(syntheticQualityChecks('plan',{},c).some(i=>!i.passed));
 const copied={actions:{'1.4.1':{kind:'terminal',commands:'echo 48.4; echo 23.6'}}};
 assert.equal(syntheticQualityChecks('commands-analyze',copied,c).find(i=>i.name.startsWith('no fabricated')).passed,false);
 const claims=[1,2,3].map(i=>({validation_ref:'validate-'+i}));
 const plan={experiments:[{stages:[{steps:claims.concat(claims[0])}]}]};
 assert.equal(syntheticQualityChecks('plan',plan,c).find(i=>i.name==='one dedicated validation for claim 1').passed,false);
});
test('model benchmark replay checks frozen identity and NUL strings without inference or command execution',async()=>{
 const name='unit-model-report-'+randomUUID(),directory=join('.test-artifacts/synthetic-model-benchmarks',name);
 await privateDirectory(directory);
 const plan=stepPlan(),breakdown=stepBreakdown(),request=stepCommandsRequest('00000000-0000-4000-8000-000000000001',1,'1.1.1',plan,breakdown);
 const job={id:'selected-step',task:'commands-analyze',model:request.model,effort:'medium',action_ref:'1.1.1',request,testCase:{id:'SNC-NEG-001',plan,breakdown}};
 const output=stepCommandFixture('1.1.1',plan,breakdown);output.actions['1.1.1'].notes='NUL test\0';
 const saved={identity:sha256(JSON.stringify(job)),status:'completed',started_at:'2026-11-16T00:00:00Z',terminal_observed_at:'2026-11-16T00:00:01Z',response:{id:'offline-only',status:'completed',model:request.model,output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]}};
 await privateJSON(join(directory,'manifest.json'),{run:name,jobs:[job],identity:sha256(JSON.stringify([job])),policy:{version:'offline-test'}});
 await privateJSON(join(directory,'selected-step.json'),saved);
 const args=['--import','./scripts/lib/register-typescript.mjs','scripts/benchmark-paper-models.mjs','--run',name,'--replay'];
 const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000,env:{...process.env,OPENAI_API_KEY:'synthetic-unusable-key'}});
 assert.equal(result.status,0,result.stderr);
 const report=JSON.parse(await readFile(join(directory,'report.json'),'utf8'));
 assert.equal(report.admitted_calls,1);assert.deepEqual(report.rows[0].nul_paths,['$.actions.1.1.1.notes']);
 assert.match(await readFile(join(directory,'report.md'),'utf8'),/Output integrity/);
 saved.identity='0'.repeat(64);await privateJSON(join(directory,'selected-step.json'),saved);
 const tampered=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000});
 assert.equal(tampered.status,1);assert.match(tampered.stderr,/identity does not match/);
});
