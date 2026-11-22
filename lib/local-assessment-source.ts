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
  return [
    `Use the JumpServe paper assessment skill to assess the PDF uploaded for JumpServe assessment ${assessmentId}. Call the JumpServe download_assessment_pdf tool with assessment_id "${assessmentId}" and save the verified PDF as ${localAssessmentSourceFilename(assessmentId)} in the local assessment directory.`,
    "Prepare the assessment locally and confirm the experiment scope with me before running experiments. At any stage, if an authorized action is blocked, use the client's native approval or consent mechanism for the specific resource or command and continue once granted.",
    "Never automatically reject a permission request. Only I can decline it. If the client reports automatic review, show me how to select human review before submitting the request. If an automatic reviewer blocks an attempt, tell me which action needs approval and keep the request pending for my decision.",
    "If I decline or the client prevents human review, record the outcome and save the assessment for resumption. If the PDF download is blocked, offer to verify a local copy downloaded from Step 1 for this same assessment. Stage a plan-only preview only if I choose it.",
    `Keep raw evidence local. Set bundle.paper.pdf_copy to true and pass assessment_id "${assessmentId}" alongside the bundle to JumpServe's preview_assessment tool. Return the private review link.`,
  ].join("\n\n");
}
