import { readFileSync } from 'node:fs';
import { paperAgentRequest, paperAgentTool } from '../../lib/paper-agent.ts';
import { deterministicQualityChecks } from '../../lib/paper-quality-checks.ts';
const input = JSON.parse(readFileSync(0, 'utf8')), row = input.workflow;
if (input.mode === 'request') console.log(JSON.stringify(paperAgentRequest(row)));
else if (input.mode === 'read') console.log(JSON.stringify(paperAgentTool(row, { name: 'read_evidence', arguments: {record:'field_limits'} })));
else if (input.mode === 'patch') {
  const path = row.step === 2 ? '/breakdown/sections/access/0/description' : row.step === 3 ? '/experiments/0/title' : '/setup/notes';
  const original = row.step === 2 ? row.agent.candidate.breakdown.sections.access[0].description : row.step === 3 ? row.agent.candidate.experiments[0].title : row.agent.candidate.setup.notes;
  const args = { edits_json: JSON.stringify([{ op: 'replace', path, value: original + ' Reviewed.' }]) };
  console.log(JSON.stringify({ arguments: args, ...paperAgentTool(row, { name: 'apply_patch', arguments: args }) }));
} else if (input.mode === 'reject') {
  const path = row.step === 2 ? '/breakdown/sections/access/0/description' : row.step === 3 ? '/experiments/0/title' : '/setup/notes';
  const limit = row.step === 2 ? 400 : row.step === 3 ? 200 : 1200;
  const args = { edits_json: JSON.stringify([{ op: 'replace', path, value: 'x'.repeat(limit + 5) }]) };
  console.log(JSON.stringify({ arguments: args, ...paperAgentTool(row, { name: 'apply_patch', arguments: args }) }));
} else if (input.mode === 'validator') console.log(JSON.stringify(paperAgentTool(row, { name: 'run_validator', arguments: {} })));
else if (input.mode === 'checks') console.log(JSON.stringify(deterministicQualityChecks({ ...row.source_json, candidate: row.agent.candidate })));
else throw new Error('Unsupported fixed managed-agent fixture.');
