import { PAPER_FIELD_LIMITS as L } from "./paper-field-limits";
import { PAPER_BREAKDOWN_SECTIONS, type PaperBreakdown } from "./research-paper-breakdown";
import { planningSources, type ExperimentPlan } from "./paper-experiment-plan";
import { terminalActionRefs } from "./paper-terminal-commands";
import { validPaperDependencies } from "./paper-detail-dependencies";
import { assertCompleteCommandBody } from "./paper-experiment-scripts";
import type { QualitySource } from "./paper-quality-model";

export type PaperFieldDiagnostic = { path: string; code: string; actual: string | number; limit?: number; message: string };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const pointer = (v: string) => v.replaceAll("~", "~0").replaceAll("/", "~1");
/** Explain bounded fields and reference failures. The original validators remain
 * the authority; this supplements their structural/source checks, never repairs. */
export function paperFieldDiagnostics(source: QualitySource): PaperFieldDiagnostic[] {
  const out: PaperFieldDiagnostic[] = [];
  const add = (path: string, code: string, actual: string | number, message: string, limit?: number) => {
    if (out.length < 29) out.push({ path: path.slice(0, 200), code, actual: typeof actual === "string" ? actual.slice(0, 120) : actual, ...(limit === undefined ? {} : { limit }), message: message.slice(0, 2000) });
  };
  const text = (v: unknown, path: string, max: number, nullable = false, utf16 = false) => {
    if (v === null && nullable) return;
    if (typeof v !== "string") { add(path, "text_type", v === null ? "null" : typeof v, "A nonempty text field is required."); return; }
    const length = utf16 ? v.length : [...v].length;
    if (!v.trim()) add(path, "empty_text", length, "Text must contain a non-whitespace character.");
    if (length > max) add(path, "text_limit", length, `This field allows at most ${max} ${utf16 ? "UTF-16 code units" : "characters"}; the proposed text has ${length}. Compress wording without changing scientific meaning.`, max);
  };
  const array = (v: unknown, path: string, max: number, min = 0): unknown[] => {
    if (!Array.isArray(v)) { add(path, "array_type", typeof v, "An array is required."); return []; }
    if (v.length > max || v.length < min) add(path, "array_size", v.length, `Use ${min}–${max} entries.`, max);
    return v;
  };
  const exact = (v: Record<string, unknown>, path: string, keys: string[]) => {
    for (const key of keys) if (!Object.hasOwn(v, key)) add(`${path}/${pointer(key)}`, "missing_field", "missing", "This field is required.");
    for (const key of Object.keys(v)) if (!keys.includes(key)) add(`${path}/${pointer(key)}`, "unknown_field", "present", "This field is not part of the stored contract.");
  };
  const choice = (v: unknown, path: string, choices: readonly string[]) => {
    if (typeof v !== "string" || !choices.includes(v)) add(path, "enum_value", String(v).slice(0, 120), `Use one of: ${choices.join(", ")}.`);
  };
  const refs = (v: unknown, path: string, allowed: Set<string>, min = 0, max: number = L.plan.refs) => {
    const entries = array(v, path, max, min), seen = new Set();
    entries.forEach((r, i) => {
      if (typeof r !== "string" || !allowed.has(r)) add(`${path}/${i}`, "unknown_reference", String(r).slice(0, 120), "Use a reference from the frozen reference map; do not infer IDs from suffixes.");
      if (seen.has(r)) add(`${path}/${i}`, "duplicate_reference", String(r).slice(0, 120), "References must be unique.");
      seen.add(r);
    });
    return entries;
  };
  const c = source.candidate;
  if (!object(c)) { add("", "object_type", typeof c, "The candidate must be an object."); return out; }
  if (source.step === 2) {
    text(c.title, "/title", 300, true, true); text(c.domain, "/domain", 300, true, true);
    array(c.authors, "/authors", Number.MAX_SAFE_INTEGER).forEach((a, i) => text(a, `/authors/${i}`, 200, false, true));
    const b = c.breakdown;
    if (!object(b)) { add("/breakdown", "object_type", typeof b, "A stored paper breakdown is required."); return out; }
    const paper = source.paper as { totalPages?: number; pages?: { page: number; text: string }[] } | undefined;
    const quote = (q: unknown, page: unknown, path: string) => {
      text(q, `${path}/quote`, L.detail.quote);
      if (!Number.isSafeInteger(page) || Number(page) < 1 || Number(page) > Number(b.total_pages) || Array.isArray(b.missing_text_pages) && b.missing_text_pages.includes(page)) add(`${path}/page`, "page_reference", String(page), "Use an existing PDF page with retained text.", Number(b.total_pages));
      const original = paper?.pages?.find(p => p.page === page);
      if (typeof q === "string" && q.trim() && (!original || !original.text.replace(/\s+/g, " ").trim().includes(q.replace(/\s+/g, " ").trim()))) add(`${path}/quote`, "quote_mismatch", "not_found", `The quote is not present on retained PDF page ${String(page)} after whitespace normalization. Read that page and use exact source text.`);
    };
    const citations = (v: unknown, path: string, min = 1) => {
      const seen = new Set();
      array(v, path, L.detail.citations, min).forEach((cit, i) => {
        if (!object(cit)) { add(`${path}/${i}`, "object_type", typeof cit, "A {page,quote} citation is required."); return; }
        exact(cit, `${path}/${i}`, ["page", "quote"]); quote(cit.quote, cit.page, `${path}/${i}`);
        const key = JSON.stringify([cit.page, cit.quote]);
        if (seen.has(key)) add(`${path}/${i}`, "duplicate_citation", "duplicate", "Use each citation only once.");
        seen.add(key);
      });
    };
    const ids = new Set(); let count = 0;
    for (const { id } of PAPER_BREAKDOWN_SECTIONS) {
      const entries = array(object(b.sections) ? b.sections[id] : undefined, `/breakdown/sections/${id}`, 200); count += entries.length;
      entries.forEach((item, i) => {
        const path = `/breakdown/sections/${id}/${i}`;
        if (!object(item)) { add(path, "object_type", typeof item, "A paper detail object is required."); return; }
        text(item.id, `${path}/id`, L.detail.id); text(item.description, `${path}/description`, L.detail.description); quote(item.quote, item.page, path);
        if (ids.has(item.id)) add(`${path}/id`, "duplicate_id", String(item.id), "Detail IDs must be unique across sections.");
        ids.add(item.id);
        if (item.citations !== undefined) {
          citations(item.citations, `${path}/citations`);
          const first = Array.isArray(item.citations) ? item.citations[0] : null;
          if (object(first) && (first.quote !== item.quote || first.page !== item.page)) add(`${path}/citations/0`, "primary_citation", "different", "The first citation must equal the detail's quote and page; edit both atomically.");
          text(item.label, `${path}/label`, L.detail.label, true);
          choice(item.kind, `${path}/kind`, id === "experiment" ? ["experiment_specification"] : id === "validate" ? ["requirement", "claim", "limitation"] : id === "data" ? ["requirement", "reported_result", "limitation"] : ["requirement", "limitation"]);
        }
        if (object(item.criterion)) {
          exact(item.criterion, `${path}/criterion`, ["metric", "comparison", "target", "acceptance", "tolerance"]);
          for (const [key, max] of Object.entries(L.criterion)) text(item.criterion[key], `${path}/criterion/${key}`, max, key === "tolerance");
          choice(item.criterion.acceptance, `${path}/criterion/acceptance`, ["paper_defined", "needs_definition"]);
        }
        if (item.kind === "claim" && !object(item.criterion)) add(`${path}/criterion`, "object_type", typeof item.criterion, "A claim requires its original metric, comparison, target, acceptance and tolerance.");
        if (item.kind && item.kind !== "claim" && item.criterion !== null) add(`${path}/criterion`, "unexpected_criterion", "present", "Only claim details have criteria; other kinds require criterion:null.");
        if (item.kind === "experiment_specification" && !object(item.specification)) add(`${path}/specification`, "object_type", typeof item.specification, "An experiment specification requires setup, procedure, conditions and comparisons.");
        if (object(item.specification)) for (const key of ["setup", "procedure", "conditions", "comparisons"]) {
          const value = item.specification[key]; text(value, `${path}/specification/${key}`, L.detail.specification);
          if (typeof value === "string" && !/[.!?]$/u.test(value.trim())) add(`${path}/specification/${key}`, "sentence_ending", "missing", "Finish the specification sentence with punctuation.");
        }
      });
      if (!validPaperDependencies(entries as PaperBreakdown["sections"]["access"])) add(`/breakdown/sections/${id}`, "dependencies", "invalid", "Dependencies must be unique, acyclic stored IDs in this same section; use [] for independent details.");
    }
    const max = Math.min(200, b.extraction_version ? 32 : Number(b.cursor) * 8);
    if (count > max) add("/breakdown/sections", "detail_count", count, `At most ${max} details are allowed across all four sections.`, max);
    if (object(b.provenance)) {
      exact(b.provenance, "/breakdown/provenance", ["classification", "statement", "citations"]);
      choice(b.provenance.classification, "/breakdown/provenance/classification", ["synthetic", "simulated", "reported_empirical", "unspecified"]);
      if (b.provenance.classification !== "unspecified") text(b.provenance.statement, "/breakdown/provenance/statement", L.document.statement);
      else if (b.provenance.statement !== null || !Array.isArray(b.provenance.citations) || b.provenance.citations.length) add("/breakdown/provenance", "unspecified_provenance", "nonempty", "Unspecified provenance requires statement:null and citations:[].");
      citations(b.provenance.citations, "/breakdown/provenance/citations", b.provenance.classification === "unspecified" ? 0 : 1);
    }
    if (b.implementation_choices !== undefined) array(b.implementation_choices, "/breakdown/implementation_choices", L.document.choices).forEach((choice, i) => {
      if (!object(choice)) return;
      exact(choice, `/breakdown/implementation_choices/${i}`, ["name", "reason", "citations"]);
      text(choice.name, `/breakdown/implementation_choices/${i}/name`, L.document.name); text(choice.reason, `/breakdown/implementation_choices/${i}/reason`, L.document.reason); citations(choice.citations, `/breakdown/implementation_choices/${i}/citations`);
    });
  } else if (source.step === 3) {
    exact(c, "", ["experiments"]);
    const sources = planningSources(source.confirmed_breakdown as PaperBreakdown), all = new Set(Object.values(sources).flat().map(s => s.ref)), experiments = new Set(sources.experiment.map(s => s.ref)), claims = new Set(sources.validate.filter(s => s.kind === "claim").map(s => s.ref));
    const covered = new Set(), checked = new Set();
    array(c.experiments, "/experiments", L.plan.experiments).forEach((e, i) => {
      if (!object(e)) return;
      const path = `/experiments/${i}`, hierarchical = "stages" in e;
      exact(e, path, ["title", "experiment_refs", "open_questions", hierarchical ? "stages" : "steps"]);
      text(e.title, `${path}/title`, L.plan.title);
      for (const ref of refs(e.experiment_refs, `${path}/experiment_refs`, experiments, 1)) { if (covered.has(ref)) add(`${path}/experiment_refs`, "duplicate_coverage", String(ref), "Each confirmed experiment must be assigned exactly once."); covered.add(ref); }
      array(e.open_questions, `${path}/open_questions`, L.plan.questions).forEach((q, j) => text(q, `${path}/open_questions/${j}`, L.plan.question));
      const steps = (v: unknown, p: string) => array(v, p, hierarchical ? L.plan.steps : L.plan.flatSteps, 1).forEach((s, j) => {
        if (!object(s)) return;
        const sp = `${p}/${j}`;
        exact(s, sp, ["title", "instructions", "basis", "source_refs", ...(hierarchical || "validation_ref" in s ? ["validation_ref"] : [])]);
        text(s.title, `${sp}/title`, L.plan.stepTitle); text(s.instructions, `${sp}/instructions`, hierarchical ? L.plan.instructions : L.plan.flatInstructions);
        choice(s.basis, `${sp}/basis`, ["paper", "proposed"]);
        refs(s.source_refs, `${sp}/source_refs`, all, s.basis === "paper" ? 1 : 0);
        if (s.validation_ref != null) {
          if (!claims.has(String(s.validation_ref)) || !Array.isArray(s.source_refs) || !s.source_refs.includes(s.validation_ref)) add(`${sp}/validation_ref`, "validation_reference", String(s.validation_ref), "Use a confirmed claim ref and include it in source_refs.");
          if (checked.has(s.validation_ref)) add(`${sp}/validation_ref`, "duplicate_validation", String(s.validation_ref), "Only the final evaluation step may be assigned this claim; measurements can cite it using source_refs.");
          checked.add(s.validation_ref);
        }
      });
      if (hierarchical) array(e.stages, `${path}/stages`, L.plan.stages, 1).forEach((s, j) => { if (object(s)) { exact(s, `${path}/stages/${j}`, ["title", "steps"]); text(s.title, `${path}/stages/${j}/title`, L.plan.stageTitle); steps(s.steps, `${path}/stages/${j}/steps`); } });
      else steps(e.steps, `${path}/steps`);
    });
    for (const ref of experiments) if (!covered.has(ref)) add("/experiments", "missing_experiment", ref, "Include this confirmed experiment exactly once.");
    if (experiments.size) for (const ref of claims) if (!checked.has(ref)) add("/experiments", "missing_validation", ref, "Assign this claim to a distinct final evaluation step using validation_ref.");
  } else {
    exact(c, "", ["setup", "actions", "cleanup", "inputs"]);
    const inputs = new Set();
    array(c.inputs, "/inputs", L.scripts.inputs).forEach((input, i) => { if (object(input)) {
      exact(input, `/inputs/${i}`, ["name", "description", "secret"]); text(input.description, `/inputs/${i}/description`, L.scripts.inputDescription);
      if (typeof input.name !== "string" || !/^JUMPSERVE_[A-Z][A-Z0-9_]{0,63}$/.test(input.name)) add(`/inputs/${i}/name`, "input_name", String(input.name).slice(0,120), "Use JUMPSERVE_ followed by an uppercase letter and up to 63 uppercase letters, digits or underscores.");
      if (inputs.has(input.name)) add(`/inputs/${i}/name`, "duplicate_input", String(input.name), "Input names must be unique.");
      inputs.add(input.name);
      if (typeof input.secret !== "boolean") add(`/inputs/${i}/secret`, "boolean_type", typeof input.secret, "Use true or false.");
    } });
    const refsForPlan = terminalActionRefs(source.plan as ExperimentPlan, source.experiment_index), allowed = new Set<string>();
    if (object(c.actions)) exact(c.actions, "/actions", refsForPlan);
    for (const ref of ["setup", ...refsForPlan, "cleanup"]) {
      const path = ref === "setup" || ref === "cleanup" ? `/${ref}` : `/actions/${pointer(ref)}`, block = ref === "setup" || ref === "cleanup" ? c[ref] : object(c.actions) ? c.actions[ref] : undefined;
      if (!object(block)) { add(path, "object_type", typeof block, "A saved command block is required."); continue; }
      exact(block, path, ["kind", "commands", "prerequisites", "verification", "notes", "needs_sudo"]);
      choice(block.kind, `${path}/kind`, ["terminal", "manual", "blocked"]);
      if (typeof block.needs_sudo !== "boolean") add(`${path}/needs_sudo`, "boolean_type", typeof block.needs_sudo, "Use true or false.");
      text(block.verification, `${path}/verification`, L.scripts.verification); text(block.notes, `${path}/notes`, L.scripts.notes);
      refs(block.prerequisites, `${path}/prerequisites`, allowed, 0, L.scripts.prerequisites);
      if (block.kind === "terminal") {
        text(block.commands, `${path}/commands`, ref === "setup" ? L.scripts.setup : L.scripts.commands);
        if (ref !== "setup" && (!Array.isArray(block.prerequisites) || !block.prerequisites.includes("setup"))) add(`${path}/prerequisites`, "setup_required", "missing", "Executable experiment blocks must declare the shared setup prerequisite.");
        if (typeof block.commands === "string") try { assertCompleteCommandBody(block.commands); } catch (e) { add(`${path}/commands`, "unfinished_heredoc", "unterminated", (e as Error).message); }
        if (typeof block.commands === "string" && block.commands.includes("\u0000")) add(`${path}/commands`, "null_character", "present", "Command bodies cannot contain a NUL character.");
      } else if (block.commands !== null || block.needs_sudo !== false) add(path, "nonterminal_commands", "present", "Manual and blocked steps require commands:null and needs_sudo:false.");
      allowed.add(ref);
    }
    const size = Buffer.byteLength(JSON.stringify(c));
    if (size > L.scripts.bytes) add("", "byte_limit", size, `The complete command set exceeds ${L.scripts.bytes} UTF-8 bytes.`, L.scripts.bytes);
  }
  return out;
}
