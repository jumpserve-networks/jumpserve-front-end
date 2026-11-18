import { RESEARCH_WORKFLOW_MODULE_PATH } from "./test-modules";
import { researchAssessmentPath } from "./research-pathways";

export const PAPER_WORK_STATUS_PATH = `${RESEARCH_WORKFLOW_MODULE_PATH}/api/paper-workflow`;
export const PAPER_WORK_STATUS_VERSION = "paper-work-status-v1";
export const WORK_STAGES = ["not_generated", "submitting", "processing", "uncertain", "ready", "failed", "cancelled"] as const;
export type PaperWorkStage = typeof WORK_STAGES[number];
export type PaperWorkUnit = { id: string; title: string; step: 3 | 4; index: number; total: number; stage: PaperWorkStage; reason: string | null; updated_at: string | null; status_error?: string };
export type PaperWorkListing = { version: typeof PAPER_WORK_STATUS_VERSION; study_ids: string[]; units: PaperWorkUnit[]; next_cursor: number };
export type PaperWorkActivity = Omit<PaperWorkUnit, "index"> & { ready: number; pending: number; needs_attention: number };
export const workKey = (unit: Pick<PaperWorkUnit, "id" | "step" | "index">) => `${unit.id}:${unit.step}:${unit.index}`;
export const workGroup = (unit: Pick<PaperWorkUnit, "id" | "step">) => `${unit.id}:${unit.step}`;
export const workPending = (stage: PaperWorkStage) => stage === "submitting" || stage === "processing";
export const workNoticeKey = (activity: PaperWorkActivity) => `${workGroup(activity)}:${workPending(activity.stage) ? "working" : activity.stage}`;
export const workPath = (activity: Pick<PaperWorkUnit, "id" | "step">) => `${researchAssessmentPath(activity.id)}?step=${activity.step === 3 ? "implementation" : "execution"}`;
const id = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function validatePaperWorkListing(value: unknown): PaperWorkListing {
  const v = value as PaperWorkListing;
  if (!v || v.version !== PAPER_WORK_STATUS_VERSION || !Array.isArray(v.study_ids) || v.study_ids.length > 1000 || !v.study_ids.every(id) || new Set(v.study_ids).size !== v.study_ids.length || !Array.isArray(v.units) || v.units.length > 9000 || !Number.isSafeInteger(v.next_cursor) || v.next_cursor < 0 || v.next_cursor > 9000) throw new Error("Background paper status could not be verified.");
  const keys = new Set<string>(), groups = new Map<string, PaperWorkUnit[]>();
  for (const unit of v.units) {
    if (!unit || !v.study_ids.includes(unit.id) || typeof unit.title !== "string" || !unit.title.trim() || unit.title.length > 300 || ![3, 4].includes(unit.step) || !Number.isSafeInteger(unit.total) || unit.total < 1 || unit.total > (unit.step === 3 ? 1 : 8) || !Number.isSafeInteger(unit.index) || unit.index < 1 || unit.index > unit.total || !WORK_STAGES.includes(unit.stage) || unit.reason !== null && (typeof unit.reason !== "string" || unit.reason.length > 2000) || unit.updated_at !== null && (typeof unit.updated_at !== "string" || !Number.isFinite(Date.parse(unit.updated_at))) || unit.status_error !== undefined && (typeof unit.status_error !== "string" || unit.status_error.length > 2000) || keys.has(workKey(unit))) throw new Error("Background paper status could not be verified.");
    keys.add(workKey(unit));
    groups.set(workGroup(unit), [...(groups.get(workGroup(unit)) ?? []), unit]);
  }
  for (const group of groups.values()) {
    if (group.length !== group[0].total || group.some(other => other.total !== group[0].total || other.title !== group[0].title)) throw new Error("Background paper status is incomplete.");
  }
  return v;
}
export function paperWorkActivities(units: PaperWorkUnit[]): PaperWorkActivity[] {
  const groups = new Map<string, PaperWorkUnit[]>();
  for (const unit of units) groups.set(workGroup(unit), [...(groups.get(workGroup(unit)) ?? []), unit]);
  return [...groups.values()].map(group => {
    const first = group[0], ready = group.filter(u => u.stage === "ready").length, pending = group.filter(u => workPending(u.stage)).length;
    const stage = pending ? "processing" : group.some(u => u.stage === "uncertain") ? "uncertain" : group.some(u => u.stage === "failed") ? "failed" : ready === first.total ? "ready" : group.some(u => u.stage === "cancelled") ? "cancelled" : "not_generated";
    const attention = group.find(u => ["failed", "uncertain", "cancelled"].includes(u.stage));
    return { ...first, stage, reason: attention?.reason ?? first.reason, ready, pending, needs_attention: group.filter(u => ["failed", "uncertain", "cancelled"].includes(u.stage)).length, status_error: group.find(u => u.status_error)?.status_error };
  });
}
