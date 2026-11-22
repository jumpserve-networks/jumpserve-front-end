import { isResearchId } from "./research-experiment-queue";
import { PAPER_ASSESSMENT_STEPS } from "./paper-assessment-wizard";
import { RESEARCH_WORKFLOW_MODULE_PATH } from "./test-modules";

export const ASSESSMENT_PROGRESS_PATH = `${RESEARCH_WORKFLOW_MODULE_PATH}/api/assessment-progress`;
export const ASSESSMENT_PROGRESS_VERSION = "assessment-wizard-progress-v1";
export type AssessmentStep = 1 | 2 | 3 | 4 | 5;
export type AssessmentWizardProgress = { version: typeof ASSESSMENT_PROGRESS_VERSION; access: "public-read-only"; assessments: { id: string; step: AssessmentStep | null }[] };

export function validateProgressIds(ids: string[]) {
  if (!ids.length || ids.length > 10 || ids.some(id => !isResearchId(id)) || new Set(ids).size !== ids.length) throw new Error("Supply between one and ten unique assessment IDs.");
}

export function assessmentStepLabel(step: AssessmentStep) {
  return `Step ${step} · ${PAPER_ASSESSMENT_STEPS[step - 1].title}`;
}

export async function loadAssessmentWizardProgress(ids: string[], signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<AssessmentWizardProgress> {
  validateProgressIds(ids);
  const query = new URLSearchParams(ids.map(id => ["id", id]));
  const deadline = AbortSignal.timeout(30000);
  const response = await fetcher(`${ASSESSMENT_PROGRESS_PATH}?${query}`, { method: "GET", credentials: "omit", cache: "no-store", signal: signal ? AbortSignal.any([signal, deadline]) : deadline, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Assessment steps are temporarily unavailable.");
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > 10000) throw new Error("Assessment steps could not be verified.");
  const value = JSON.parse(raw) as AssessmentWizardProgress;
  if (!value || value.version !== ASSESSMENT_PROGRESS_VERSION || value.access !== "public-read-only" || !Array.isArray(value.assessments) || value.assessments.length !== ids.length ||
      new Set(value.assessments.map(item => item?.id)).size !== ids.length || value.assessments.some(item => !item || !ids.includes(item.id) || item.step !== null && ![1, 2, 3, 4, 5].includes(item.step))) throw new Error("Assessment steps could not be verified.");
  return value;
}
