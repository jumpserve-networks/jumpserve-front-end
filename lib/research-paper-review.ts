import { PAPER_REVIEW_VERSION } from "./research-paper-upload";

export type PaperReview = {
  version: string; id: string; status: "preparing" | "ready" | "failed" | "confirmed"; revision: number;
  title: string | null; domain: string | null; reason: string | null; progress: string; can_start: boolean;
  claims: { id: string; description: string; claim_type: string; location: string; source_id: string }[];
  coverage: Record<string, unknown>;
  confirmation: { title: string; domain: string; claim_ids: string[] } | null;
  limits: { max_spend_cents: number; committed_cents: number; deadline_at: string };
};
export function validatePaperReview(value: PaperReview, id: string) {
  if (!value || value.version !== PAPER_REVIEW_VERSION || value.id !== id || !["preparing", "ready", "failed", "confirmed"].includes(value.status) || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.can_start !== "boolean" || !Array.isArray(value.claims) || value.claims.length > 200 || new Set(value.claims.map(c => c.id)).size !== value.claims.length || !value.claims.every(c => typeof c.id === "string" && typeof c.description === "string" && typeof c.location === "string" && typeof c.claim_type === "string") || ![value.title, value.domain, value.reason].every(v => v === null || typeof v === "string") || value.limits?.max_spend_cents !== 10000 || !Number.isFinite(Date.parse(value.limits.deadline_at))) throw new Error("Paper review identity or coverage could not be verified. Reload before confirming.");
  if (typeof value.progress !== "string" || !Number.isSafeInteger(value.limits.committed_cents) || value.limits.committed_cents < 0 || value.limits.committed_cents > 10000 || value.status === "confirmed" && (!value.confirmation || typeof value.confirmation.title !== "string" || typeof value.confirmation.domain !== "string" || !Array.isArray(value.confirmation.claim_ids) || !value.confirmation.claim_ids.every(c => value.claims.some(claim => claim.id === c))) || value.can_start && value.status !== "ready") throw new Error("Paper review status or authorization could not be verified. Reload before confirming.");
  return value;
}
