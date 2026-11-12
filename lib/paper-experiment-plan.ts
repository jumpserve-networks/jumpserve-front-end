import { PAPER_BREAKDOWN_SECTIONS, validatePaperBreakdown, type PaperBreakdown, type PaperBreakdownSection } from "./research-paper-breakdown";
import { RESEARCH_WORKFLOW_MODULE_PATH } from "./test-modules";
import type { PaperCitation, PaperCriterion, PaperExperimentSpecification } from "./paper-breakdown-evidence";

export const EXPERIMENT_PLAN_VERSION = "paper-experiment-plan-v1";
export const EXPERIMENT_PLAN_PATH = `${RESEARCH_WORKFLOW_MODULE_PATH}/api/experiment-plan`;
export type ReviewedSections = Record<PaperBreakdownSection, { id: string; description: string }[]>;
export type ExperimentStep = { title: string; instructions: string; basis: "paper" | "proposed"; source_refs: string[]; validation_ref?: string | null };
export type PlannedExperiment = { title: string; experiment_refs: string[]; steps: ExperimentStep[]; open_questions: string[] };
export type ExperimentPlan = { experiments: PlannedExperiment[] };
export type PlanStage = "awaiting_confirmation" | "submitting" | "processing" | "uncertain" | "ready" | "failed" | "cancelled";
export type ExperimentPlanView = {
  version: typeof EXPERIMENT_PLAN_VERSION; study_id: string; stage: PlanStage; intake_revision: number;
  confirmed_at: string | null; confirmed_breakdown: PaperBreakdown | null; plan: ExperimentPlan | null; reason: string | null;
};
export const planPending = (stage: PlanStage) => stage === "submitting" || stage === "processing";
export const reviewedSections = (breakdown: PaperBreakdown): ReviewedSections => Object.fromEntries(PAPER_BREAKDOWN_SECTIONS.map(({ id }) => [id, breakdown.sections[id].map(({ id, description }) => ({ id, description }))])) as ReviewedSections;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join(",") === [...keys].sort().join(",");
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && [...v].length <= max;

/** Only descriptions and inclusion can change. Original quotes and page identities remain intact. */
export function confirmPaperSections(original: PaperBreakdown, value: unknown): PaperBreakdown {
  validatePaperBreakdown(original);
  if (!object(value) || !exact(value, PAPER_BREAKDOWN_SECTIONS.map(s => s.id))) throw new Error("Review all four paper sections before confirming.");
  const sections = Object.fromEntries(PAPER_BREAKDOWN_SECTIONS.map(({ id }) => {
    const entries = value[id], originals = original.sections[id];
    if (!Array.isArray(entries) || entries.length > originals.length) throw new Error("The reviewed section contains an unknown detail.");
    const seen = new Set<string>();
    return [id, entries.map(entry => {
      if (!object(entry) || !exact(entry, ["id", "description"]) || !text(entry.id, 100) || !text(entry.description, 400) || seen.has(entry.id)) throw new Error("Each reviewed detail needs a unique identity and a description of at most 400 characters.");
      const source = originals.find(item => item.id === entry.id);
      if (!source) throw new Error("A reviewed detail does not belong to this section.");
      seen.add(entry.id);
      return { ...source, description: entry.description.trim() };
    })];
  })) as PaperBreakdown["sections"];
  return validatePaperBreakdown({ ...original, sections });
}

export function planningSources(breakdown: PaperBreakdown) {
  return Object.fromEntries(PAPER_BREAKDOWN_SECTIONS.map(({ id }) => [id, breakdown.sections[id].map((item, index) => ({ ref: `${id}-${index + 1}`, description: item.description, quote: item.quote, page: item.page,
    ...(item.citations ? { citations: item.citations, kind: item.kind, label: item.label, criterion: item.criterion, specification: item.specification } : {}),
  }))])) as Record<PaperBreakdownSection, { ref: string; description: string; quote: string; page: number; citations?: PaperCitation[]; kind?: string; label?: string | null; criterion?: PaperCriterion | null; specification?: PaperExperimentSpecification | null }[]>;
}

export function planningInput(breakdown: PaperBreakdown) {
  return { phase: "confirmed-paper-breakdown-v1", sections: planningSources(breakdown), ...(breakdown.provenance ? { provenance: breakdown.provenance, implementation_choices: breakdown.implementation_choices, reported_values_origin: "paper_reported" } : {}) };
}

export function validateExperimentPlan(value: unknown, breakdown: PaperBreakdown): ExperimentPlan {
  const fail = () => new Error("The experiment steps could not be verified against the confirmed paper sections.");
  if (!object(value) || !exact(value, ["experiments"]) || !Array.isArray(value.experiments) || value.experiments.length > 8) throw fail();
  const sources = planningSources(breakdown), refs = new Set(Object.values(sources).flat().map(s => s.ref));
  const expected = new Set(sources.experiment.map(s => s.ref)), covered = new Set<string>();
  const claims = new Set(sources.validate.filter(s => s.kind === "claim").map(s => s.ref)), checked = new Set<string>();
  const refList = (v: unknown, allowed: Set<string>, min = 0): v is string[] => Array.isArray(v) && v.length >= min && v.length <= 32 && v.every(r => typeof r === "string" && allowed.has(r)) && new Set(v).size === v.length;
  for (const experiment of value.experiments) {
    if (!object(experiment) || !exact(experiment, ["title", "experiment_refs", "steps", "open_questions"]) || !text(experiment.title, 200) || !refList(experiment.experiment_refs, expected, 1) ||
      !Array.isArray(experiment.steps) || !experiment.steps.length || experiment.steps.length > 12 || !Array.isArray(experiment.open_questions) || experiment.open_questions.length > 12 || !experiment.open_questions.every(q => text(q, 400))) throw fail();
    for (const ref of experiment.experiment_refs) { if (covered.has(ref)) throw fail(); covered.add(ref); }
    for (const step of experiment.steps) {
      if (!object(step) || !exact(step, ["title", "instructions", "basis", "source_refs", ...("validation_ref" in step ? ["validation_ref"] : [])]) || !text(step.title, 160) || !text(step.instructions, 1200) || !["paper", "proposed"].includes(String(step.basis)) || !refList(step.source_refs, refs, step.basis === "paper" ? 1 : 0)) throw fail();
      if (step.validation_ref != null) {
        if (typeof step.validation_ref !== "string" || !claims.has(step.validation_ref) || checked.has(step.validation_ref) || !step.source_refs.includes(step.validation_ref)) throw fail();
        checked.add(step.validation_ref);
      }
    }
  }
  if (covered.size !== expected.size) throw fail();
  if (expected.size && checked.size !== claims.size) throw new Error("Each confirmed claim needs its own source-linked validation step.");
  return value as ExperimentPlan;
}

export function validateExperimentPlanView(value: unknown, id: string): ExperimentPlanView {
  const v = value as ExperimentPlanView;
  if (!v || v.version !== EXPERIMENT_PLAN_VERSION || v.study_id !== id || !["awaiting_confirmation", "submitting", "processing", "uncertain", "ready", "failed", "cancelled"].includes(v.stage) || !Number.isSafeInteger(v.intake_revision) || v.intake_revision < 1 ||
    v.reason !== null && !text(v.reason, 2000)) throw new Error("Experiment planning status could not be verified.");
  if (v.stage === "awaiting_confirmation") {
    if (v.confirmed_at !== null || v.confirmed_breakdown !== null || v.plan !== null) throw new Error("An unconfirmed paper cannot contain an experiment plan.");
  } else {
    if (!v.confirmed_at || !Number.isFinite(Date.parse(v.confirmed_at))) throw new Error("The phase-one confirmation is missing.");
    validatePaperBreakdown(v.confirmed_breakdown);
    if (v.plan !== null) validateExperimentPlan(v.plan, v.confirmed_breakdown!);
    if (v.stage === "ready" && v.plan === null) throw new Error("The recorded experiment plan is missing.");
  }
  return v;
}
