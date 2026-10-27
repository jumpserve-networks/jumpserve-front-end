import { ASSESSMENTS_PATH, NEW_ASSESSMENT_PATH, RESEARCH_IDEAS_MODULE_PATH, RESEARCH_WORKFLOW_MODULE_PATH } from "./test-modules";
import type { ResearchStudy } from "./research-workflow";

export type ResearchStudyKind = "paper" | "idea";

// Older paper assessments predate study_kind. Their existing identities stay intact.
export function researchStudyKind(study: Pick<ResearchStudy, "study_kind">): ResearchStudyKind {
  return study.study_kind === "idea" ? "idea" : "paper";
}

export function researchModulePath(kind: ResearchStudyKind) {
  return kind === "idea" ? RESEARCH_IDEAS_MODULE_PATH : RESEARCH_WORKFLOW_MODULE_PATH;
}

export function researchPublishedPath(kind: ResearchStudyKind, id: string) {
  return `${kind === "paper" ? ASSESSMENTS_PATH : `${RESEARCH_IDEAS_MODULE_PATH}/studies`}/${id}`;
}

export function researchExportPath(kind: ResearchStudyKind, id: string) {
  return `${researchModulePath(kind)}/api/${kind === "paper" ? "assessments" : "studies"}/${id}/export`;
}

// Normalize saved queue links without choosing between conflicting identities.
// Validation remains the caller's responsibility; repeated IDs are not collapsed.
export function assessmentQueueQuery(input: Record<string, string | string[] | undefined>) {
  const query = { ...input };
  let changed = false;
  let conflicting = false;
  if (query.view === "private") { delete query.view; changed = true; }
  for (const [legacy, canonical] of [["study", "assessment"], ["sourceStudy", "sourceAssessment"]]) {
    if (query[legacy] === undefined) continue;
    if (query[canonical] !== undefined) { conflicting = true; continue; }
    query[canonical] = query[legacy];
    delete query[legacy];
    changed = true;
  }
  return { query, changed, conflicting };
}

export function studiesForPathway(studies: ResearchStudy[], kind: ResearchStudyKind) {
  return studies.filter(study => researchStudyKind(study) === kind);
}

export function researchWorkspacePath(study: Pick<ResearchStudy, "id" | "study_kind" | "claim_design" | "paper_review_status">) {
  const kind = researchStudyKind(study);
  if (kind === "paper" && study.paper_review_status && study.paper_review_status !== "confirmed") return `${NEW_ASSESSMENT_PATH}/${study.id}`;
  if (kind === "paper" && study.claim_design === true) return `${RESEARCH_WORKFLOW_MODULE_PATH}/experiment-design/${study.id}`;
  return `${researchModulePath(kind)}/${kind === "idea" ? "ideas" : "workspace"}/${study.id}`;
}

export function researchSearchSuffix(query: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) search.append(key, item);
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}
