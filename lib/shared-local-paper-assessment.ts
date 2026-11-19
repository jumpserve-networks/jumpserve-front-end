import type { LocalPaperAssessment } from "./local-paper-assessment";
import type { PaperBreakdownSection, PaperBreakdownItem } from "./research-paper-breakdown";
import type { ExperimentPlan, PlannedExperiment, ExperimentStep } from "./paper-experiment-plan";
import type { TerminalBlock, TerminalCommandSet } from "./paper-terminal-commands";

export type SharedPaperDetail = Pick<PaperBreakdownItem, "id" | "description" | "kind" | "label" | "criterion" | "specification" | "depends_on"> & { pages: number[] };
export type SharedTerminalBlock = TerminalBlock & { redacted_preview?: string };
type SharedTerminalCommandSet = Omit<TerminalCommandSet, "setup" | "actions" | "cleanup"> & { setup: SharedTerminalBlock; actions: Record<string, SharedTerminalBlock>; cleanup: SharedTerminalBlock };
export type SharedLocalPaperAssessment = {
  version: "local-codex-shared-assessment-v1"; study_id: string; title: string; domain: string; completed_at: string;
  sections: Record<PaperBreakdownSection, SharedPaperDetail[]>; plan: ExperimentPlan; scripts: SharedTerminalCommandSet[];
  provenance: { classification: string; statement: string | null } | null;
  implementation_choices: { name: string; reason: string }[]; limitation: string;
  projection: { redacted: number; originals_unchanged: true; note: string };
};

/** Explicit public fields only. Original PDFs/text, requests and identities never enter the projection. */
export function shareLocalPaperAssessment(v: LocalPaperAssessment): SharedLocalPaperAssessment {
  let redacted = 0;
  const clean = (value: string) => {
    const patterns = [
      /\b(?:sk-[A-Za-z0-9_-]{12,}|sb_secret_[A-Za-z0-9_-]{8,}|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{12,})\b/g,
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      /\/(?:Users|home|private|var|tmp|mnt|root|workspace)\/[^\s"'<>`]+/g,
      /(?:research-paper-uploads|research-workflow-raw)\/[^\s"'<>`]+/g,
      /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)\s*[=:]\s*["']?[^\s"',;]+/gi,
      /https?:\/\/[^\s"'<>]+[?&](?:token|key|signature|X-Amz-[A-Za-z-]+)=[^\s"'<>]+/gi,
    ];
    // Protocol JSON embedded in a script can contain source citations too.
    const withoutQuotes = value.replace(/"quote"\s*:\s*"(?:\\.|[^"\\])*"/g, () => { redacted++;return '"quote":"[source quotation omitted]"'; });
    return patterns.reduce((text, pattern) => text.replace(pattern, () => { redacted++;return "[redacted]"; }), withoutQuotes);
  };
  const criterion = (c: PaperBreakdownItem["criterion"]) => c ? { metric: clean(c.metric), comparison: clean(c.comparison), target: clean(c.target), acceptance: c.acceptance, tolerance: c.tolerance === null ? null : clean(c.tolerance) } : null;
  const sections = Object.fromEntries(Object.entries(v.breakdown.sections).map(([section, items]) => [section, items.map(item => ({
    id: item.id, description: clean(item.description), kind: item.kind, label: item.label == null ? null : clean(item.label), criterion: criterion(item.criterion),
    specification: item.specification ? { setup: clean(item.specification.setup), conditions: clean(item.specification.conditions), procedure: clean(item.specification.procedure), comparisons: clean(item.specification.comparisons) } : null,
    depends_on: item.depends_on ?? [], pages: [...new Set((item.citations ?? [{ page: item.page }]).map(c => c.page))],
  }))])) as SharedLocalPaperAssessment["sections"];
  const step = (s: ExperimentStep): ExperimentStep => ({ title: clean(s.title), instructions: clean(s.instructions), basis: s.basis, source_refs: [...s.source_refs], ...(s.validation_ref === undefined ? {} : { validation_ref: s.validation_ref }) });
  const plan: ExperimentPlan = { experiments: v.plan.experiments.map((e): PlannedExperiment => ({ title: clean(e.title), experiment_refs: [...e.experiment_refs], open_questions: e.open_questions.map(clean), ...(e.stages ? { stages: e.stages.map(s => ({ title: clean(s.title), steps: s.steps.map(step) })) } : { steps: e.steps.map(step) }) })) };
  const block = (b: TerminalBlock): SharedTerminalBlock => {
    const notes = clean(b.notes), verification = clean(b.verification), commands = b.commands === null ? null : clean(b.commands);
    if (commands !== b.commands) return { kind: "blocked", commands: null, redacted_preview: commands ?? undefined, prerequisites: [...b.prerequisites], verification: "The owner can inspect the original command privately.", notes: "This command contains information omitted from the shared copy.", needs_sudo: false };
    return { kind: b.kind, commands, prerequisites: [...b.prerequisites], verification, notes, needs_sudo: b.needs_sudo };
  };
  const scripts = v.scripts.map(set => {
    const setup = block(set.setup), actions = Object.fromEntries(Object.entries(set.actions).map(([ref, b]) => [ref, block(b)]));let cleanup = block(set.cleanup);
    // A redacted shared setup cannot safely support copyable action scripts.
    if (set.setup.kind === "terminal" && setup.kind !== "terminal") {
      for (const [ref, b] of Object.entries(actions)) if (b.kind === "terminal") actions[ref] = { ...b, kind: "blocked", commands: null, redacted_preview: b.commands ?? undefined, needs_sudo: false, notes: "The shared setup was redacted. The owner retains the original commands." };
      if (cleanup.kind === "terminal") cleanup = { ...cleanup, kind: "blocked", commands: null, redacted_preview: cleanup.commands ?? undefined, needs_sudo: false, notes: "The shared setup was redacted. The owner retains the original cleanup." };
    }
    return { setup, actions, cleanup, inputs: set.inputs.map(input => ({ name: input.name, description: clean(input.description), secret: input.secret })) };
  });
  const result: SharedLocalPaperAssessment = { version: "local-codex-shared-assessment-v1", study_id: v.study_id, title: clean(v.title), domain: clean(v.domain), completed_at: v.completed_at, sections, plan, scripts,
    provenance: v.breakdown.provenance ? { classification: v.breakdown.provenance.classification, statement: v.breakdown.provenance.statement === null ? null : clean(v.breakdown.provenance.statement) } : null,
    implementation_choices: (v.breakdown.implementation_choices ?? []).map(c => ({ name: clean(c.name), reason: clean(c.reason) })), limitation: clean(v.breakdown.limitation),
    projection: { redacted, originals_unchanged: true, note: "Shared read-only copy. Original PDF text, source quotations, private file locations and account details are omitted. Paper hashes identify unchanged originals, not this shared copy. Original records remain unchanged." } };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 4_000_000) throw new Error("The shared local assessment exceeds the public response limit.");
  return result;
}
