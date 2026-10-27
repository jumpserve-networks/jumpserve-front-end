export type AssessmentStatus = "running" | "completed" | "completed-with-blockers" | "budget" | "deadline" | "cancelled";
export type AssessmentCounts = { total: number; finished: number; reproduced: number; discrepant: number; blocked: number; running: number; queued: number; waiting: number };
export type AssessmentSummary = { status: AssessmentStatus; updated_at: string; counts: AssessmentCounts };
export type AssessmentActivity = { id: string; title: string; phase: "preparing" | "assessing" | "finished"; status: AssessmentStatus | "preparing" | "submitted" | "unavailable"; counts: AssessmentCounts | null; statusError?: string };
export const ASSESSMENT_STATUS_VERSION = "research-assessment-status-v1";
export const activityKey = (id: string, phase: AssessmentActivity["phase"]) => `${id}:${phase}`;

export function parseAssessmentSummary(value: unknown): AssessmentSummary | null {
  if (value == null) return null;
  const summary = value as AssessmentSummary;
  const names = ["total", "finished", "reproduced", "discrepant", "blocked", "running", "queued", "waiting"] as const;
  if (!["running", "completed", "completed-with-blockers", "budget", "deadline", "cancelled"].includes(summary.status) || typeof summary.updated_at !== "string" || !Number.isFinite(Date.parse(summary.updated_at)) || !summary.counts || names.some(key => !Number.isSafeInteger(summary.counts[key]) || summary.counts[key] < 0 || summary.counts[key] > 20000) || names.some(key => summary.counts[key] > summary.counts.total) || summary.counts.reproduced + summary.counts.discrepant > summary.counts.finished || ["finished", "blocked", "running", "queued", "waiting"].reduce((total, key) => total + summary.counts[key as keyof AssessmentCounts], 0) > summary.counts.total) {
    throw new Error("Assessment notification progress could not be verified.");
  }
  return { status: summary.status, updated_at: summary.updated_at, counts: Object.fromEntries(names.map(key => [key, summary.counts[key]])) as AssessmentCounts };
}

export function assessmentActivityHeading(activity: AssessmentActivity) {
  if (activity.status === "unavailable") return "Assessment status unavailable";
  if (activity.phase === "preparing") return "Preparing your paper…";
  if (activity.phase === "assessing") return activity.status === "submitted" || activity.counts && activity.counts.queued > 0 && activity.counts.running === 0 && activity.counts.waiting === 0 ? "Assessment queued" : "Assessing your paper…";
  return {
    completed: "Assessment complete",
    "completed-with-blockers": "Assessment finished with gaps",
    budget: "Assessment reached its spending limit",
    deadline: "Assessment reached its time limit",
    cancelled: "Assessment cancelled",
  }[activity.status as Exclude<AssessmentStatus, "running">] ?? "Assessment needs attention";
}
