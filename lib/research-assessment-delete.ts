import { requireAccessToken } from "./browser-auth";
import { isResearchId } from "./research-experiment-queue";
import { RESEARCH_WORKFLOW_MODULE_PATH } from "./test-modules";

export function assessmentDeletePath(id: string) {
  if (!isResearchId(id)) throw new Error("A valid assessment ID is required.");
  return `${RESEARCH_WORKFLOW_MODULE_PATH}/api/assessments/${id}`;
}

export async function deleteAssessment(id: string, userId: string) {
  const token = await requireAccessToken("Sign in to delete your assessment.", userId);
  const response = await fetch(assessmentDeletePath(id), { method: "DELETE", cache: "no-store", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Assessment deletion failed (HTTP ${response.status}).`);
  if (result.id !== id || result.deleted !== true) throw new Error("Deletion was not confirmed. Refresh your assessments before trying again.");
}
