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
  return `Use the JumpServe paper assessment skill to assess the PDF uploaded for JumpServe assessment ${assessmentId}. Call the JumpServe download_assessment_pdf tool with assessment_id "${assessmentId}" and save the verified PDF as ${localAssessmentSourceFilename(assessmentId)} in the local assessment directory.\n\nPrepare the assessment locally and confirm the experiment scope with me before running experiments. Keep raw evidence local. Set bundle.paper.pdf_copy to true and pass assessment_id "${assessmentId}" alongside the bundle to JumpServe's preview_assessment tool. Return the private review link.`;
}
