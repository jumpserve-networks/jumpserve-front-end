import { join } from 'node:path';

export const BATCH_SKILLS = { generator: 'jumpserve-paper-assessment', verifier: 'jumpserve-assessment-verifier' };

export class PaperAssessmentError extends Error {}

export function batchCasePaths(caseDirectory) {
  return { caseDirectory, paper: join(caseDirectory, 'paper.pdf'), key: join(caseDirectory, 'answer-key.json'),
    artifactDirectory: join(caseDirectory, 'generator'), output: join(caseDirectory, 'verifier') };
}

export function generatorPrompt({ skillDirectory, workflow, paper, paperSha256, guidance, testbed }) {
  return `Follow the JumpServe Generator skill at ${skillDirectory}/SKILL.md using its batch worker entry point.\n` +
    `Use the pinned workflow at ${workflow}. Set skill_instructions to ${JSON.stringify(guidance)}.\n` +
    `Input PDF: ${paper}\nExpected SHA-256: ${paperSha256}\n${testbed}\n` +
    `Write the skill's assessment bundle and evidence in the current working directory. The parent runner confirms private saving.`;
}

export function verifierPrompt({ skillDirectory, workflow, caseDirectory, paper, key, assessment, guidance, rubric }) {
  return `Follow the JumpServe Verifier skill at ${skillDirectory}/SKILL.md for a fresh batch review.\n` +
    `Use the pinned workflow at ${workflow}. Set skill_instructions to ${JSON.stringify(guidance)}.\n` +
    `Input PDF: ${paper}\nAssessment: ${assessment}\nAnswer key: ${key}\n` +
    `Use ${caseDirectory} as the base directory for every path in claims[].evidence. ` +
    `Cite files relative to that directory with precise page, line, or row selectors where applicable. ` +
    `For example, use "paper.pdf pp. 1–2" or "generator/evidence/trace.jsonl lines 2–5". ` +
    `Use this base regardless of your working directory. Omit absolute paths and parent directory segments (..).\n` +
    `Use the skill's evidence preflight with the supplied PDF. Record its status and verified_runs in evidence_integrity.\n` +
    `Use these exact rubric criteria and maxima: ${JSON.stringify(rubric)}. The parent runner confirms private saving.\n` +
    `Return the skill's scorecard JSON as your final response.`;
}

export function requireReviewPreflight(result, expected) {
  if (result?.pdf_bytes_checked !== true || result.mode !== 'fresh' || result.evidence_integrity?.status !== 'verified' ||
      Object.entries(expected).some(([field, value]) => result[field] !== value)) {
    throw new PaperAssessmentError('Independent evidence preflight did not verify the exact inputs.');
  }
  return result;
}
