import type { PaperDetail } from "./research-paper-catalog";
import { paperWorkflowLabel } from "./research-paper-catalog";
import { assessmentSummaryFromPublicQueue, type PublicAutonomousTask, type PublicStudyQueue } from "./research-public-queue";

export const ASSESSMENT_STAGE_LABELS: Record<string, string> = {
  intake: "Paper preparation", comprehension: "Claim analysis", planning: "Experiment planning",
  building: "Experiment implementation", critic: "Plan validation", execution: "Experiment execution", assessment: "Results assessment",
};
const repairs: Record<string, string> = { diagnosing: "Diagnosing", repairing: "Repairing", validating: "Validating repair", resuming: "Resuming" };
export function assessmentTaskStage(task: PublicAutonomousTask) {
  const stage = ASSESSMENT_STAGE_LABELS[task.stage] ?? "Stage not recorded";
  const repair = task.repair_progress && repairs[task.repair_progress.state];
  return repair ? `${stage} · ${repair}` : stage;
}

export function assessmentProgress(queue: PublicStudyQueue | null, preparation: PaperDetail["preparation_status"] = null) {
  const workflow = queue?.autonomy.workflows[0];
  const tasks = queue?.autonomy.tasks ?? [];
  const unfinished = tasks.filter(task => ["running", "queued", "waiting", "blocked", "attempt-limit", "budget", "deadline"].includes(task.status));
  const running = unfinished.filter(task => task.status === "running");
  const current = running.length ? running : unfinished;
  const preparationStage = { preparing: "Preparing paper", ready: "Ready for review", failed: "Preparation needs attention", confirmed: queue ? "Awaiting assessment" : "Not recorded" };
  const stage = workflow && workflow.status !== "running" ? paperWorkflowLabel(workflow.status as NonNullable<PaperDetail["paper"]["workflow_status"]>)
    : current.length ? [...new Set(current.map(assessmentTaskStage))].join("; ")
    : workflow ? "Awaiting next stage" : preparation ? preparationStage[preparation] : "Not recorded";
  const updates = [...(workflow ? [workflow.updated_at] : []), ...tasks.map(task => task.updated_at), ...(queue?.jobs.map(job => job.updated_at) ?? [])];
  const lastUpdated = updates.length ? updates.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest) : null;
  const summary = queue ? assessmentSummaryFromPublicQueue(queue, queue.study.id) : null;
  return { stage, lastUpdated, counts: summary?.counts ?? null };
}
