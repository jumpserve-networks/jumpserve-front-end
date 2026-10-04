import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.argv[2] ?? 'http://localhost:3000';
if (!['http://localhost:3000', 'https://jumpserve.quaint-lab.org'].includes(origin)) throw new Error('Verification is restricted to JumpServe or its local development server');
const path = '/module/http2-compliance-study';
const report = { origin, started_at: new Date().toISOString(), checks: [], errors: [] };
async function check(name, action) {
  try { const evidence = await action(); report.checks.push({ name, passed: true, evidence }); }
  catch (error) { report.errors.push({ name, reason: error.message }); }
}
function csvRows(text) {
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted && text[i+1]==='"') { cell+='"'; i++; } else quoted=!quoted; }
    else if(!quoted && c===',') { row.push(cell);cell=''; }
    else if(!quoted && c==='\n') { row.push(cell.replace(/\r$/, ''));rows.push(row);row=[];cell=''; }
    else cell+=c;
  }
  assert.equal(quoted,false); if(cell || row.length) {row.push(cell);rows.push(row);} return rows;
}
await check('public completed pages', async () => {
  const pages=[];
  for(const suffix of ['', '/test-results', '/methods', '/literature']) {
    const r=await fetch(origin+path+suffix); assert.equal(r.status,200);
    const html=await r.text(); assert.ok(!html.includes('Application error:'));
    pages.push({suffix, status:r.status});
  }
  return pages;
});
await check('complete public JSON export', async () => {
  const r=await fetch(origin+path+'/api/results');assert.equal(r.status,200);
  const bytes=await r.text(), data=JSON.parse(bytes);
  assert.equal(data.measurements.length,7176);assert.equal(data.frames.length,84);
  assert.equal(data.configurations.length,57);assert.equal(data.runs.length,60);
  assert.equal(data.sources.length,49);assert.equal(data.claims.length,14);assert.equal(data.protocols.length,6);
  assert.equal(new Set(data.measurements.map(m=>m.run_id+':'+m.test_id)).size,7176);
  assert.equal(data.measurements.filter(m=>m.outcome==='unknown').length,443);
  assert.ok(data.measurements.filter(m=>m.outcome==='unknown').every(m=>m.preserved_rule_conformant===null));
  assert.ok(data.measurements.some(m=>m.error_code===null));
  assert.ok(data.measurements.some(m=>m.error_code>2147483647));
  assert.ok(data.configurations.every(c=>c.actual_resources===null));
  assert.ok(!('artifacts' in data));
  assert.equal(data.campaign.provenance.analysis_version,'http2-assessment-v3');
  return { sha256:createHash('sha256').update(bytes).digest('hex'), bytes:Buffer.byteLength(bytes), measurements:7176, loopback:84, unknown:443 };
});
await check('complete CSV with missing error codes', async () => {
  const r=await fetch(origin+path+'/api/results?format=csv');assert.equal(r.status,200);
  const text=await r.text(), rows=csvRows(text);
  assert.equal(rows.length,7177);assert.ok(rows.every(row=>row.length===15));
  const code=rows[0].indexOf('error_code');assert.ok(rows.slice(1).some(row=>row[code]===''));
  assert.equal(new Set(rows.slice(1).map(row=>row[0]+':'+row[1])).size,7176);
  return { sha256:createHash('sha256').update(text).digest('hex'), rows:7176, fields:15 };
});
await check('bounded measurement API', async () => {
  const bad=await fetch(origin+path+'/api/measurements?runId=bad');assert.equal(bad.status,400);
  const valid=await fetch(origin+path+'/api/measurements?runId=archive-001');assert.equal(valid.status,200);
  return { invalid_status:bad.status, valid_status:valid.status };
});
await check('Google sign-in preserves configuration deep link', async () => {
  const r=await fetch(origin+path+'/chat?configuration=Mitmproxy-11.1.0');
  const target=new URL(r.url);
  assert.equal(target.pathname,'/login');
  assert.equal(target.searchParams.get('next'),path+'/chat?configuration=Mitmproxy-11.1.0');
  return { destination:target.pathname, next:target.searchParams.get('next'), actual_authenticated_chat:'not exercised: no legitimate Google session in this verifier' };
});
report.ended_at=new Date().toISOString();report.passed=report.errors.length===0;
await mkdir('.test-artifacts',{recursive:true});
await writeFile('.test-artifacts/http2-verify-'+(origin.startsWith('http://localhost')?'local':'production')+'.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
