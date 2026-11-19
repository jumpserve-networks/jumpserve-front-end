import { PAPER_FIELD_LIMITS as LIMITS } from "./paper-field-limits";
import { PAPER_BREAKDOWN_SECTIONS, validatePaperBreakdown, type PaperBreakdown, type PaperBreakdownSection } from "./research-paper-breakdown";
import { RESEARCH_WORKFLOW_MODULE_PATH } from "./test-modules";
import type { PaperCitation, PaperCriterion, PaperExperimentSpecification } from "./paper-breakdown-evidence";
import { validPaperDependencies } from "./paper-detail-dependencies";
import { validateQualityProgress, type PaperQualityProgress } from "./paper-quality";

export const EXPERIMENT_PLAN_VERSION = "paper-experiment-plan-v1";
export const MAX_EXPERIMENT_STAGES = LIMITS.plan.stages;
export const MAX_STAGE_ACTIONS = LIMITS.plan.steps;
export const MAX_EXPERIMENT_ACTIONS = MAX_EXPERIMENT_STAGES * MAX_STAGE_ACTIONS;
export const EXPERIMENT_PLAN_PATH = `${RESEARCH_WORKFLOW_MODULE_PATH}/api/experiment-plan`;
export type ReviewedSections = Record<PaperBreakdownSection, { id: string; description: string }[]>;
export type ExperimentStep = { title: string; instructions: string; basis: "paper" | "proposed"; source_refs: string[]; validation_ref?: string | null };
export type ExperimentStage = { title: string; steps: ExperimentStep[] };
export type PlannedExperiment = { title: string; experiment_refs: string[]; open_questions: string[] } & (
  { steps: ExperimentStep[]; stages?: never } | { stages: ExperimentStage[]; steps?: never }
);
export type ExperimentPlan = { experiments: PlannedExperiment[] };
export const experimentActions = (experiment: PlannedExperiment): ExperimentStep[] => experiment.stages ? experiment.stages.flatMap(stage => stage.steps) : experiment.steps;
export type PlanStage = "awaiting_confirmation" | "submitting" | "processing" | "uncertain" | "ready" | "failed" | "cancelled";
export type ExperimentPlanView = {
  version: typeof EXPERIMENT_PLAN_VERSION; study_id: string; stage: PlanStage; intake_revision: number;
  confirmed_at: string | null; confirmed_breakdown: PaperBreakdown | null; plan: ExperimentPlan | null; reason: string | null;
  link_review?: { id: string; original_revision: number; reviewed_at: string; reviewer_type: "AI" | "human" };
  quality?: PaperQualityProgress;
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
  if (Object.values(sections).some(items => !validPaperDependencies(items))) throw new Error("Include prerequisites or exclude their dependent details before continuing.");
  return validatePaperBreakdown({ ...original, sections });
}

export type PaperPlanningSource = { ref: string; description: string; quote: string; page: number; citations?: PaperCitation[]; kind?: string; label?: string | null; criterion?: PaperCriterion | null; specification?: PaperExperimentSpecification | null; depends_on?: string[] };
export function planningSources(breakdown: PaperBreakdown) {
  return Object.fromEntries(PAPER_BREAKDOWN_SECTIONS.map(({ id }) => {
    const refs = new Map(breakdown.sections[id].map((item, index) => [item.id, `${id}-${index + 1}`]));
    return [id, breakdown.sections[id].map(item => ({ ref: refs.get(item.id)!, description: item.description, quote: item.quote, page: item.page,
      ...(item.citations ? { citations: item.citations, kind: item.kind, label: item.label, criterion: item.criterion, specification: item.specification } : {}),
      ...(item.depends_on ? { depends_on: item.depends_on.map(ref => refs.get(ref)!) } : {}),
    }))];
  })) as Record<PaperBreakdownSection, PaperPlanningSource[]>;
}

export function planningInput(breakdown: PaperBreakdown) {
  return { phase: "confirmed-paper-breakdown-v1", sections: planningSources(breakdown), ...(breakdown.provenance ? { provenance: breakdown.provenance, implementation_choices: breakdown.implementation_choices, reported_values_origin: "paper_reported" } : {}) };
}

export function validateExperimentPlan(value: unknown, breakdown: PaperBreakdown): ExperimentPlan {
  const fail = () => new Error("The experiment steps could not be verified against the confirmed paper sections.");
  if (!object(value) || !exact(value, ["experiments"]) || !Array.isArray(value.experiments) || value.experiments.length > LIMITS.plan.experiments) throw fail();
  const sources = planningSources(breakdown), refs = new Set(Object.values(sources).flat().map(s => s.ref));
  const expected = new Set(sources.experiment.map(s => s.ref)), covered = new Set<string>();
  const claims = new Set(sources.validate.filter(s => s.kind === "claim").map(s => s.ref)), checked = new Set<string>();
  const refList = (v: unknown, allowed: Set<string>, min = 0): v is string[] => Array.isArray(v) && v.length >= min && v.length <= LIMITS.plan.refs && v.every(r => typeof r === "string" && allowed.has(r)) && new Set(v).size === v.length;
  let format: "flat" | "hierarchical" | undefined;
  for (const experiment of value.experiments) {
    if (!object(experiment)) throw fail();
    const hierarchical = "stages" in experiment;
    const currentFormat = hierarchical ? "hierarchical" : "flat";
    if (format && format !== currentFormat) throw fail();
    format = currentFormat;
    if (!exact(experiment, ["title", "experiment_refs", hierarchical ? "stages" : "steps", "open_questions"]) || !text(experiment.title, LIMITS.plan.title) || !refList(experiment.experiment_refs, expected, 1) ||
      !Array.isArray(experiment.open_questions) || experiment.open_questions.length > LIMITS.plan.questions || !experiment.open_questions.every(q => text(q, LIMITS.plan.question))) throw fail();
    let steps: unknown[];
    if (hierarchical) {
      if (!Array.isArray(experiment.stages) || !experiment.stages.length || experiment.stages.length > MAX_EXPERIMENT_STAGES) throw fail();
      steps = [];
      for (const stage of experiment.stages) {
        if (!object(stage) || !exact(stage, ["title", "steps"]) || !text(stage.title, LIMITS.plan.stageTitle) || !Array.isArray(stage.steps) || !stage.steps.length || stage.steps.length > MAX_STAGE_ACTIONS) throw fail();
        steps.push(...stage.steps);
      }
      if (steps.length > MAX_EXPERIMENT_ACTIONS) throw fail();
    } else {
      if (!Array.isArray(experiment.steps) || !experiment.steps.length || experiment.steps.length > LIMITS.plan.flatSteps) throw fail();
      steps = experiment.steps;
    }
    for (const ref of experiment.experiment_refs) { if (covered.has(ref)) throw fail(); covered.add(ref); }
    for (const step of steps) {
      if (!object(step) || !exact(step, ["title", "instructions", "basis", "source_refs", ...(hierarchical || "validation_ref" in step ? ["validation_ref"] : [])]) || !text(step.title, LIMITS.plan.stepTitle) || !text(step.instructions, hierarchical ? LIMITS.plan.instructions : LIMITS.plan.flatInstructions) || !["paper", "proposed"].includes(String(step.basis)) || !refList(step.source_refs, refs, step.basis === "paper" ? 1 : 0) ||
        hierarchical && step.validation_ref !== null && typeof step.validation_ref !== "string") throw fail();
      if (step.validation_ref != null) {
        if (typeof step.validation_ref !== "string" || !claims.has(step.validation_ref) || !step.source_refs.includes(step.validation_ref)) throw fail();
        if (checked.has(step.validation_ref)) throw new Error(`More than one step is assigned to ${step.validation_ref}. Measurement and calibration steps may cite a claim, but only its final evaluation should use validation_ref. The original response is retained.`);
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
  if (v.link_review !== undefined && (v.stage !== "ready" || !object(v.link_review) || !text(v.link_review.id, 100) || !Number.isSafeInteger(v.link_review.original_revision) || v.link_review.original_revision < 1 || !Number.isFinite(Date.parse(v.link_review.reviewed_at)) || !["AI", "human"].includes(v.link_review.reviewer_type))) throw new Error("The recorded plan review could not be verified.");
  if (v.quality !== undefined) validateQualityProgress(v.quality);
  return v;
}
