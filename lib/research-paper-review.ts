import { PAPER_REVIEW_VERSION } from "./research-paper-upload";
import { isAssessmentBudgetCents } from "./research-autonomy";

export const PAPER_SELECTION_VERSION = "paper-review-selection-v1";
export type ReviewGroup = "central_claims" | "testable_findings";
export type ReviewSelection = Record<ReviewGroup, string[]>;
export type ReviewOrganization = { version: typeof PAPER_SELECTION_VERSION; status: "unorganized" | "preparing" | "ready"; central_claims: { claim_id: string; label: string }[]; testable_findings: { claim_id: string; label: string }[]; candidate_count: number; cursor: number; rationale?: string };

export type PaperReview = {
  version: string; id: string; status: "preparing" | "ready" | "failed" | "confirmed"; revision: number;
  title: string | null; domain: string | null; reason: string | null; progress: string; can_start: boolean;
  claims: { id: string; description: string; claim_type: string; location: string; source_id: string }[];
  coverage: Record<string, unknown>;
  organization?: ReviewOrganization;
  confirmation: { title: string; domain: string; claim_ids: string[]; selection?: ReviewSelection } | null;
  limits: { max_spend_cents: number | null; committed_cents: number; deadline_at: string };
};
export function validatePaperReview(value: PaperReview, id: string) {
  if (!value || value.version !== PAPER_REVIEW_VERSION || value.id !== id || !["preparing", "ready", "failed", "confirmed"].includes(value.status) || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.can_start !== "boolean" || !Array.isArray(value.claims) || value.claims.length > 200 || new Set(value.claims.map(c => c.id)).size !== value.claims.length || !value.claims.every(c => typeof c.id === "string" && typeof c.description === "string" && typeof c.location === "string" && typeof c.claim_type === "string") || ![value.title, value.domain, value.reason].every(v => v === null || typeof v === "string") || !isAssessmentBudgetCents(value.limits?.max_spend_cents) || !Number.isFinite(Date.parse(value.limits.deadline_at))) throw new Error("Paper review identity or coverage could not be verified. Reload before confirming.");
  if (typeof value.progress !== "string" || !Number.isSafeInteger(value.limits.committed_cents) || value.limits.committed_cents < 0 || value.limits.committed_cents > (value.limits.max_spend_cents ?? 2147483647) || value.status === "confirmed" && (!value.confirmation || typeof value.confirmation.title !== "string" || typeof value.confirmation.domain !== "string" || !Array.isArray(value.confirmation.claim_ids) || !value.confirmation.claim_ids.every(c => value.claims.some(claim => claim.id === c))) || value.can_start && value.status !== "ready") throw new Error("Paper review status or authorization could not be verified. Reload before confirming.");
  if (value.organization !== undefined) {
    const o = value.organization;
    if (!o || o.version !== PAPER_SELECTION_VERSION || !["unorganized", "preparing", "ready"].includes(o.status) || o.candidate_count !== value.claims.length || !Number.isSafeInteger(o.cursor) || o.cursor < 0 || o.cursor > o.candidate_count || o.status === "ready" && o.cursor !== o.candidate_count) throw new Error("Review group coverage could not be verified.");
    const ids: string[] = [];
    for (const [group, maximum] of [["central_claims", 3], ["testable_findings", 15]] as const) {
      if (!Array.isArray(o[group]) || o[group].length > maximum || !o[group].every(c => c && typeof c.claim_id === "string" && value.claims.some(claim => claim.id === c.claim_id) && typeof c.label === "string" && [...c.label.trim()].length > 0 && [...c.label].length <= 160)) throw new Error("Review groups contain invalid statements.");
      ids.push(...o[group].map(c => c.claim_id));
    }
    if (new Set(ids).size !== ids.length) throw new Error("A statement cannot appear in both review groups.");
  }
  if (value.confirmation?.selection) {
    const ids = selectedReviewIds(value.confirmation.selection);
    if (ids.length !== value.confirmation.claim_ids.length || ids.some(id => !value.confirmation!.claim_ids.includes(id))) throw new Error("Confirmed review groups do not match the recorded selection.");
  }
  return value;
}

export function selectedReviewIds(selection: ReviewSelection): string[] {
  if (!selection || Object.keys(selection).length !== 2 || !["central_claims", "testable_findings"].every(group => Array.isArray(selection[group as ReviewGroup]) && selection[group as ReviewGroup].every(id => typeof id === "string"))) throw new Error("Select central claims and testable findings separately.");
  const ids = [...selection.central_claims, ...selection.testable_findings];
  if (ids.length > 200 || new Set(ids).size !== ids.length) throw new Error("Each selected statement must occur in only one group.");
  return ids;
}

export function reviewRoles(review: PaperReview): Record<string, ReviewGroup> {
  const roles: Record<string, ReviewGroup> = {};
  for (const group of ["central_claims", "testable_findings"] as const) {
    for (const item of review.organization?.[group] ?? []) roles[item.claim_id] = group;
  }
  for (const group of ["central_claims", "testable_findings"] as const) {
    for (const id of review.confirmation?.selection?.[group] ?? []) roles[id] = group;
  }
  return roles;
}
