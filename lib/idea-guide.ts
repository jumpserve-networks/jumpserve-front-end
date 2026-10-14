import { IDEA_FIELDS, ideaReview, type IdeaDocument, type IdeaState } from "./research-ideas";

type PlanField = typeof IDEA_FIELDS[number];
export type GuideQuestion = { id: string; section: "idea" | "methods"; label: string; question: string; help: string; example?: string; format?: "lines" | "applicability" | "origin" | "integer" };
export const IDEA_QUESTIONS: GuideQuestion[] = [
  { id: "question", section: "idea", label: "Research question", question: "What do you want to find out?", help: "Ask one question an experiment could answer. Name the behavior or comparison you care about.", example: "Does a recent request change an object's response timing at a CDN?" },
  { id: "problem", section: "idea", label: "Problem and motivation", question: "Why does this question matter?", help: "Describe the problem, who it affects, and what learning the answer would help you do." },
  { id: "hypothesis", section: "idea", label: "Proposed hypothesis", question: "What do you predict will happen?", help: "State a prediction that could turn out to be wrong. Include the conditions under which you expect it." },
  { id: "conditions", section: "idea", label: "Conditions and population", question: "Where, when, and for which systems should this prediction hold?", help: "Name the systems, traffic, locations, time window and conditions you want to study. Keep the intended scope concrete." },
  { id: "design", section: "idea", label: "Proposed experimental comparison", question: "What will you compare to test your prediction?", help: "Explain your baseline and treatment, what changes between them, and how you will assign cases to each." },
  { id: "metrics", section: "idea", label: "Measurements and units", question: "What will you measure, and in which units?", help: "Define the quantity precisely, including when measurement starts and stops. Timing, throughput and counts measure different things." },
  { id: "controls", section: "idea", label: "Controls and dependence", question: "What must stay the same for this comparison to be fair?", help: "Describe controls and possible interference. Requests, receivers or time samples from the same run may be related." },
  { id: "falsification", section: "idea", label: "What would count against the hypothesis?", question: "What result would count against your prediction?", help: "Choose a decision rule before collecting the main data. Describe a result that would make you reconsider the hypothesis." },
  { id: "inputs", section: "idea", label: "Required inputs and availability", question: "What do we need to run this experiment, and is it available?", help: "List software, endpoints, datasets, machines and equipment. Identify unavailable dependencies. Keep credentials in private experiment inputs, never in this conversation." },
  { id: "related_work", section: "idea", label: "Related work and novelty limits", question: "What has already been studied, and what is still uncertain?", help: "Name relevant research or documentation you examined and its limits. If you have not searched yet, say so; an AI suggestion does not establish novelty." },
  { id: "alternatives", section: "idea", label: "Alternative explanations and designs", question: "What else could explain the result you expect?", help: "Consider confounds, different mechanisms, and a control or alternative design that could distinguish them." },
  { id: "limitations", section: "idea", label: "Scope and limitations", question: "What will this experiment leave unanswered?", help: "State limits on causal conclusions, generalization, practical effectiveness and unavailable conditions." },
];
export const METHOD_QUESTIONS: GuideQuestion[] = [
  { id: "dates_or_epochs", section: "methods", label: "Collection dates or epochs", question: "When will the measurements be collected?", help: "Specify dates, epochs or a declared collection window. Mark exploratory work separately from the main campaign." },
  { id: "algorithms", section: "methods", label: "Algorithms and software versions", question: "Which algorithms and software versions will you use?", help: "List revisions, versions and parameters, one declaration per line. Explain inapplicability rather than inventing an algorithm.", format: "lines" },
  { id: "seeds", section: "methods", label: "Randomization and seeds", question: "Will you randomize anything?", help: "If applicable, specify the assignment algorithm and exact seeds. Otherwise explain why randomization is inapplicable.", format: "applicability" },
  { id: "sensitivity", section: "methods", label: "Sensitivity analyses", question: "Which assumptions or settings should be varied to check robustness?", help: "Declare the sensitivity checks before the main data, or explain why they are inapplicable.", format: "applicability" },
  { id: "replication_unit", section: "methods", label: "Independent replication unit", question: "What counts as one replication of this experiment?", help: "Identify the independent unit, such as a complete run or a day. More packets or requests within one run do not automatically add independent replications." },
  { id: "sample_size_rationale", section: "methods", label: "Sample-size rationale", question: "How many replications do you need, and why?", help: "Justify the count with the design, precision or pilot aim. You will set the executable repetition count in the next step; these must agree." },
  { id: "exclusions", section: "methods", label: "Exclusion rules", question: "Which observations would you exclude, and why?", help: "Declare rules before examining the main results. Preserve excluded records and their reasons." },
  { id: "missing_data", section: "methods", label: "Missing and invalid data", question: "How should failures and missing measurements be handled?", help: "Distinguish missing, invalid, ambiguous and excluded observations from recorded zero. Avoid replacing failed observations with convenient new ones." },
  { id: "statistics", section: "methods", label: "Analysis and uncertainty", question: "How will you analyze the measurements?", help: "State metrics, comparison criteria and justified uncertainty methods. For a descriptive pilot, explicitly explain why no inferential interval will be computed." },
  { id: "dependence", section: "methods", label: "Dependence structure", question: "Which observations might be related to one another?", help: "Describe pairing, clustering, repeated or temporal measurements and how the analysis will handle them." },
  { id: "stopping_rule", section: "methods", label: "Stopping rule", question: "When will the experiment stop?", help: "Declare resource and observation limits and how failures affect stopping. Avoid stopping only when the result looks favorable." },
  { id: "prior_exposure", section: "methods", label: "Prior data exposure", question: "Have you already seen data relevant to this experiment?", help: "Disclose pilots, earlier runs, threshold tuning and reused evaluation cases. Previously inspected data are not a fresh held-out test." },
  { id: "data_origin", section: "methods", label: "Origin of the observations", question: "What kind of data will this campaign produce or analyze?", help: "Emulating a network and measuring it is different from computing an idealized simulation. Choose the origin that matches the actual method.", format: "origin" },
  { id: "max_observations", section: "methods", label: "Observation limit per invocation", question: "How many metric records may one invocation return?", help: "Count records across all metrics, not just requests. This must cover the planned observations while keeping output bounded.", format: "integer" },
];
export const GUIDE_QUESTIONS = [...IDEA_QUESTIONS, ...METHOD_QUESTIONS];

export function protocolDraft(plan: IdeaDocument): Record<string, unknown> {
  const prior = plan.protocol ?? {};
  return { questions: plan.question.trim() ? [plan.question] : [], hypotheses: plan.hypothesis,
    controls: plan.controls.trim() ? [plan.controls] : [], coverage_limits: plan.limitations,
    algorithms: [], configurations: [], metrics: [], input_versions: [], ...prior };
}
export function guideAnswer(plan: IdeaDocument, question: GuideQuestion): string {
  if (question.section === "idea") return plan[question.id as PlanField];
  const value = question.id === "max_observations" ? (plan.protocol?.resource_limits as Record<string, unknown> | undefined)?.max_observations : plan.protocol?.[question.id];
  if (question.format === "lines") return Array.isArray(value) ? value.filter(v => typeof v === "string").join("\n") : "";
  if (question.format === "applicability") return value && typeof value === "object" && "rationale" in value && typeof value.rationale === "string" ? value.rationale : "";
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
export function answered(plan: IdeaDocument, question: GuideQuestion): boolean {
  if (!guideAnswer(plan, question).trim()) return false;
  if (question.format === "applicability") return typeof (plan.protocol?.[question.id] as { applicable?: unknown })?.applicable === "boolean";
  if (question.format === "integer") {
    const n = Number(guideAnswer(plan, question)); return Number.isInteger(n) && n >= 1 && n <= 10000;
  }
  if (question.format === "origin") return ["archived-data", "new-empirical", "simulation", "model-output", "software-fixture", "mixed"].includes(guideAnswer(plan, question));
  return true;
}
export function answerQuestion(plan: IdeaDocument, question: GuideQuestion, answer: string, applicable?: boolean): IdeaDocument {
  if (!answer.trim()) throw new Error("Leave this question open until you have an answer. You can ask for help without inventing information.");
  if (answer.length > 5000) throw new Error("Keep this answer within 5,000 characters.");
  const next = { ...plan };
  if (question.section === "idea") {
    next[question.id as PlanField] = answer;
    if (plan.protocol) {
      const p = { ...plan.protocol };
      if (question.id === "question") p.questions = [answer];
      if (question.id === "hypothesis") p.hypotheses = answer;
      if (question.id === "controls") p.controls = [answer];
      if (question.id === "limitations") p.coverage_limits = answer;
      next.protocol = p;
    }
  } else {
    const p = protocolDraft(next);
    if (question.format === "applicability") {
      if (typeof applicable !== "boolean") throw new Error("Choose whether this method applies, and give its rationale.");
      p[question.id] = { applicable, rationale: answer };
    } else if (question.format === "lines") p[question.id] = answer.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    else if (question.format === "integer") {
      if (!/^\d+$/.test(answer) || !Number.isSafeInteger(Number(answer)) || Number(answer) < 1 || Number(answer) > 10000) throw new Error("Choose a whole-number limit from 1 through 10,000.");
      p.resource_limits = { ...(p.resource_limits as Record<string, unknown> | undefined), max_observations: Number(answer) };
    } else if (question.format === "origin") {
      if (!["archived-data", "new-empirical", "simulation", "model-output", "software-fixture", "mixed"].includes(answer)) throw new Error("Choose an explicit observation origin.");
      p.data_origin = answer;
    } else p[question.id] = answer;
    next.protocol = p;
  }
  return next;
}
export function guideProgress(state: IdeaState) {
  const plan = state.packets.find(p => p.id === state.current_packet_id)?.document;
  const unanswered = GUIDE_QUESTIONS.filter(question => !plan || !answered(plan, question));
  const currentReviews = state.runs.filter(run => run.packet_id === state.current_packet_id && run.task !== "planning");
  const blockers = currentReviews.flatMap(run => {
    if (currentReviews.filter(r => r.task === run.task).at(-1)?.id !== run.id) return [];
    return run.output?.findings.filter(f => f.severity === "blocking") ?? [];
  });
  const execution = plan?.protocol?.execution as { runner?: string; version?: string } | undefined;
  const configured = execution?.version === "network-execution-v1" && !!execution.runner;
  const stage = unanswered.some(q => q.section === "idea") ? "idea" : unanswered.length ? "methods" : !configured ? "configuration" : state.missing.length || blockers.length ? "resolve" : state.ready ? "run" : "review";
  return { plan, unanswered, answeredCount: GUIDE_QUESTIONS.length - unanswered.length, blockers, configured, stage,
    canReview: !unanswered.length && configured && !state.missing.length,
    canAccept: !state.missing.length && !!ideaReview(state, "comprehension") && !!ideaReview(state, "critic"),
    currentCampaigns: state.campaigns.filter(c => c.packet_id === state.current_packet_id) };
}
