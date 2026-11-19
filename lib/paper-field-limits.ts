/** Stored draft limits, shared by validation and the managed repair contract.
 * Text limits use Unicode code points except existing metadata (UTF-16 units). */
export const PAPER_FIELD_LIMITS = {
  detail: { id: 100, description: 400, quote: 800, label: 120, specification: 600, citations: 12 },
  criterion: { metric: 300, comparison: 300, target: 300, tolerance: 200 },
  document: { statement: 400, choices: 8, name: 120, reason: 400 },
  plan: { experiments: 8, title: 200, stageTitle: 160, stages: 8, steps: 8, stepTitle: 160, instructions: 800, flatInstructions: 1200, flatSteps: 12, questions: 12, question: 400, refs: 32 },
  scripts: { setup: 200000, commands: 16000, inputs: 16, inputDescription: 600, prerequisites: 24, verification: 800, notes: 1200, bytes: 250000 },
} as const;
