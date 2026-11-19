import { sha256, serializePaperText, type PaperText } from "./paper-intake-model";
import { validatePaperBreakdown, type PaperBreakdown } from "./research-paper-breakdown";
import { validateExperimentPlan, type ExperimentPlan } from "./paper-experiment-plan";
import { validateExperimentScripts } from "./paper-experiment-scripts";
import type { TerminalCommandSet } from "./paper-terminal-commands";
import type { IntakeRecord } from "./paper-intake-runner";
import type { ExperimentPlanRecord } from "./paper-experiment-plan-runner";
import type { TerminalCommandsRecord } from "./paper-terminal-commands-runner";

/** Operator imports are separate evidence, never invented provider responses. */
export type LocalPaperAssessment = {
  version: "local-codex-assessment-v1"; study_id: string; source_id: string;
  original_artifact_id: string; text_artifact_id: string; title: string;
  authors: string[]; domain: string; filename: string; sha256: string; byte_count: number;
  created_at: string; completed_at: string; instructions: string; paper_text: PaperText;
  execution: { type: "local_codex"; identity: string; agents_api_calls: 0; responses_api_calls: 0; provider_response_id: null; independent_review: false; measurements_collected: false };
  breakdown: PaperBreakdown; plan: ExperimentPlan; scripts: TerminalCommandSet[];
};
const uuid = (value: unknown) => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && [...value].length <= max;
export function validateLocalPaperAssessment(value: unknown, study: string): LocalPaperAssessment {
  const v = value as LocalPaperAssessment, fail = () => new Error("The local paper assessment does not match its retained source and complete step outputs.");
  if (!v || v.version !== "local-codex-assessment-v1" || v.study_id !== study || ![v.study_id, v.source_id, v.original_artifact_id, v.text_artifact_id].every(uuid) ||
      !text(v.title, 300) || !text(v.domain, 300) || !text(v.filename, 200) || !v.filename.endsWith(".pdf") || !/^[a-f0-9]{64}$/.test(v.sha256) || !Number.isSafeInteger(v.byte_count) || v.byte_count < 1 || v.byte_count > 10_000_000 ||
      ![v.created_at, v.completed_at].every(date => typeof date === "string" && Number.isFinite(Date.parse(date))) || Date.parse(v.completed_at) < Date.parse(v.created_at) || !text(v.instructions, 40000) ||
      !Array.isArray(v.authors) || v.authors.length > 100 || v.authors.some(name => !text(name, 200) || /[\p{Cc}<>@]/u.test(name)) ||
      v.execution?.type !== "local_codex" || !text(v.execution.identity, 200) || v.execution.agents_api_calls !== 0 || v.execution.responses_api_calls !== 0 || v.execution.provider_response_id !== null || v.execution.independent_review !== false || v.execution.measurements_collected !== false) throw fail();
  const b = validatePaperBreakdown(v.breakdown);
  if (b.status !== "ready" || b.source_id !== v.source_id || b.text_artifact_id !== v.text_artifact_id || b.policy_sha256 !== sha256(v.instructions) ||
      !Array.isArray(v.paper_text?.pages) || v.paper_text.totalPages !== b.total_pages || v.paper_text.pages.length !== b.total_pages || v.paper_text.pages.some((p, i) => p.page !== i + 1 || typeof p.text !== "string") ||
      b.text_sha256 !== sha256(serializePaperText(v.paper_text))) throw fail();
  const citations = [...Object.values(b.sections).flatMap(items => items.flatMap(item => item.citations ?? [{ page: item.page, quote: item.quote }])), ...(b.provenance?.citations ?? []), ...(b.implementation_choices ?? []).flatMap(choice => choice.citations)];
  if (citations.some(c => !v.paper_text.pages.find(p => p.page === c.page)?.text.includes(c.quote))) throw fail();
  validateExperimentPlan(v.plan, b);
  if (!Array.isArray(v.scripts) || v.scripts.length !== v.plan.experiments.length) throw fail();
  v.scripts.forEach((set, i) => validateExperimentScripts(set, v.plan, b, i + 1));
  return v;
}
const policy = { execution: "local_codex", provider_calls: 0 };
export const localPaperRecord = (row: { policy_snapshot?: unknown }) => (row.policy_snapshot as { execution?: unknown } | null)?.execution === "local_codex";
export function localIntake(v: LocalPaperAssessment, owner: string): IntakeRecord {
  return { study_id: v.study_id, owner_id: owner, filename: v.filename, sha256: v.sha256, byte_count: v.byte_count, source_id: v.source_id, original_artifact_id: v.original_artifact_id, text_artifact_id: v.text_artifact_id,
    status: "ready", submit_token: null, provider_response_id: null, request: null, paper_text: v.paper_text, created_at: v.created_at, updated_at: v.completed_at, deadline_at: v.completed_at,
    title: v.title, domain: v.domain, authors: v.authors, breakdown: v.breakdown, reason: "Prepared by local Codex. No Agents API or Responses API calls; no experiment measurements collected.", revision: 1, policy_snapshot: policy };
}
export function localPlan(v: LocalPaperAssessment, owner: string): ExperimentPlanRecord {
  return { study_id: v.study_id, owner_id: owner, status: "ready", intake_revision: 1, confirmed_at: v.completed_at, confirmed_breakdown: v.breakdown, submit_token: null, provider_response_id: null, request: null, deadline_at: v.completed_at, updated_at: v.completed_at, plan: v.plan,
    reason: "Local Codex experiment plan; source constraints and unresolved criteria are retained. No independent reviewer approval is asserted.", policy_snapshot: policy, revision: 1 };
}
export function localScripts(v: LocalPaperAssessment, owner: string, index: number): TerminalCommandsRecord | null {
  const command_set = v.scripts[index - 1];
  return command_set ? { study_id: v.study_id, owner_id: owner, experiment_index: index, command_layout: "shared-setup-v2", status: "ready", source_plan: v.plan, confirmed_breakdown: v.breakdown, request: null, provider_response_id: null,
    submit_token: "local-codex-import", updated_at: v.completed_at, deadline_at: v.completed_at, command_set, reason: "Locally authored commands. Offline checks passed; Linux acquisition has not been executed.", generated_at: v.completed_at, policy_snapshot: policy, revision: 1 } : null;
}
