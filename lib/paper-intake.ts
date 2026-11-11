import { RESEARCH_WORKFLOW_MODULE_PATH } from "./test-modules";
import { validatePaperBreakdown, type PaperBreakdown } from "./research-paper-breakdown";

export const PAPER_INTAKE_VERSION = "paper-intake-next-v1";
export const PAPER_INTAKE_PATH = `${RESEARCH_WORKFLOW_MODULE_PATH}/api/paper-intake`;
export const PAPER_INTAKE_STAGES = ["uploaded", "submitting", "processing", "ready", "failed", "uncertain", "cancelled"] as const;
export type PaperIntakeStage = typeof PAPER_INTAKE_STAGES[number];
export type PaperIntakeView = {
  version: typeof PAPER_INTAKE_VERSION; id: string; status: "preparing" | "ready" | "failed";
  review_version: "research-paper-review-v1"; stage: PaperIntakeStage; title: string | null;
  authors: string[] | null; domain: string | null; created_at: string; updated_at: string;
  reason: string | null; breakdown: PaperBreakdown | null; owner: boolean; experiment_jobs: number;
};
export const paperIntakePending = (stage: PaperIntakeStage) => ["uploaded", "submitting", "processing"].includes(stage);
export function validatePaperIntake(value: unknown, id: string): PaperIntakeView {
  const v = value as PaperIntakeView;
  if (!v || v.version !== PAPER_INTAKE_VERSION || v.id !== id || !PAPER_INTAKE_STAGES.includes(v.stage) ||
      !["preparing", "ready", "failed"].includes(v.status) || typeof v.owner !== "boolean" ||
      ![v.title, v.domain, v.reason].every(text => text === null || typeof text === "string") ||
      ![v.created_at, v.updated_at].every(date => typeof date === "string" && Number.isFinite(Date.parse(date))) ||
      !Number.isSafeInteger(v.experiment_jobs) || v.experiment_jobs < 0 ||
      v.authors !== null && (!Array.isArray(v.authors) || v.authors.length > 100 || !v.authors.every(name => typeof name === "string" && name.trim() && [...name].length <= 200 && !/[\p{Cc}<>@]/u.test(name))) ||
      v.status !== (v.stage === "ready" ? "ready" : paperIntakePending(v.stage) ? "preparing" : "failed") ||
      !v.owner && v.breakdown !== null) throw new Error("Paper breakdown status could not be verified.");
  if (v.breakdown !== null) validatePaperBreakdown(v.breakdown);
  if (v.owner && v.stage === "ready" && v.breakdown === null) throw new Error("The saved paper breakdown is missing.");
  return v;
}
