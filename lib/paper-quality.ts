/** Public progress contains findings, never private drafts or provider/tool identities. */
export const PAPER_QUALITY_VERSION = "paper-quality-v1";
export const PAPER_QUALITY_FORMAT = "paper_quality_review_v1";
export const PAPER_QUALITY_PHASES = ["waiting", "reviewing", "repairing", "checking", "approved", "needs_attention", "uncertain", "cancelled"] as const;
export type PaperQualityPhase = typeof PAPER_QUALITY_PHASES[number];
export type PaperQualityStep = 2 | 3 | 4;
export type PaperQualityFinding = { id: string; severity: "blocking" | "warning"; location: string; explanation: string; evidence: string };
export type PaperQualityReview = { decision: "pass" | "revise"; summary: string; findings: PaperQualityFinding[] };
export type PaperQualityProgress = { version: typeof PAPER_QUALITY_VERSION; phase: PaperQualityPhase; round: 0 | 1; findings: PaperQualityFinding[] };
export type QualitySandboxArtifact = { file_id: string; path: string; content: string; content_sha256: string };
export type PaperQualityChecks = { version: typeof PAPER_QUALITY_VERSION; passed: boolean; source_sha256: string; findings: PaperQualityFinding[]; sandbox?: { container_id: string; call_id: string; result: Record<string, unknown>; artifact?: QualitySandboxArtifact } };
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const bounded = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
export function validateQualityReview(value: unknown): PaperQualityReview {
  if (!object(value) || Object.keys(value).sort().join(",") !== "decision,findings,summary" || !["pass", "revise"].includes(String(value.decision)) || !bounded(value.summary, 2000) || !Array.isArray(value.findings) || value.findings.length > 30) throw new Error("The quality review is incomplete or invalid.");
  const ids = new Set<string>();
  for (const item of value.findings) {
    if (!object(item) || Object.keys(item).sort().join(",") !== "evidence,explanation,id,location,severity" || !bounded(item.id, 80) || ids.has(item.id) || !["blocking", "warning"].includes(String(item.severity)) || !bounded(item.location, 200) || !bounded(item.explanation, 2000) || !bounded(item.evidence, 2000)) throw new Error("The quality findings could not be verified.");
    ids.add(item.id);
  }
  const review = value as PaperQualityReview;
  if (review.decision === "pass" && review.findings.some(f => f.severity === "blocking") || review.decision === "revise" && !review.findings.some(f => f.severity === "blocking")) throw new Error("The review decision does not match its findings.");
  return review;
}
export function qualityReason(phase: PaperQualityPhase, step: PaperQualityStep): string {
  const label = step === 2 ? "paper breakdown" : step === 3 ? "experiment steps" : "setup and run commands";
  if (phase === "approved") return "Quality checks passed.";
  if (phase === "repairing") return "Repairing the " + label + " using the recorded review findings.";
  if (phase === "checking") return "Checking the " + label + " in an isolated sandbox.";
  if (phase === "needs_attention") return "The " + label + " need attention after the bounded review and repair process.";
  if (phase === "uncertain") return "The original quality-check submission needs reconciliation. It will not be repeated automatically.";
  if (phase === "cancelled") return "Quality checking was cancelled. The original outputs are retained.";
  return "Reviewing the " + label + " before displaying the completed output.";
}
export function validateQualityProgress(value: unknown): PaperQualityProgress {
  const v = value as PaperQualityProgress;
  if (!v || v.version !== PAPER_QUALITY_VERSION || !PAPER_QUALITY_PHASES.includes(v.phase) || ![0, 1].includes(v.round)) throw new Error("Quality-check progress could not be verified.");
  validateQualityReview({ decision: v.findings?.some(f => f.severity === "blocking") ? "revise" : "pass", summary: "Recorded review progress.", findings: v.findings });
  return v;
}
