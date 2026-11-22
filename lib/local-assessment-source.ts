import { NEW_ASSESSMENT_PATH, RESEARCH_WORKFLOW_MODULE_PATH } from "@/lib/test-modules";

export const LOCAL_ASSESSMENT_SOURCE_API = `${RESEARCH_WORKFLOW_MODULE_PATH}/api/assessment-source`;
export const PAPER_UPLOAD_BUCKET = "research-paper-uploads";

export type LocalAssessmentSource = { sha256: string; byte_count: number };

export function isPaperSha256(value: unknown): value is string {
  return typeof value === "string" && value.length === 64 && /^[a-f0-9]+$/.test(value);
}

export function localAssessmentSourcePage(assessmentId: string) {
  return `${NEW_ASSESSMENT_PATH}?assessment=${assessmentId}`;
}

export function localAssessmentSourceFilename(assessmentId: string) {
  return `paper-${assessmentId}.pdf`;
}

export function localAssessmentPrompt(assessmentId: string) {
  return `Use the JumpServe paper assessment skill for ${assessmentId}. Recreate the paper's testbed and run experiments to test its claims with fresh measurements. Use published figures and tables only as reference values.`;
}
