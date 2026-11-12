import type { PaperIntakeExtraction } from "./paper-intake-model";
import type { PaperText } from "./paper-intake-model";
import { PAPER_PARAMETER_TERMS } from "./paper-evidence-index";

const normalized = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const claimIdentity = (label: string) => label.trim().match(/^(?:(?:hypothesis|claim)\s+)?([hq]\s*\d+)\b/iu)?.[1].replace(/\s/gu, "").toLowerCase() ?? normalized(label);
const numericAgreement = (rule: string | null) => rule !== null && /\d/u.test(rule) && (/[±<>≤≥=]|\b(?:within|between|at most|at least|less than|greater than)\b/iu.test(rule) || /^\s*(?:[+-]\s*)?\d+(?:\.\d+)?(?:\s|%|$)/u.test(rule));

/** Narrow, deterministic quality rules for v4. These do not establish semantic entailment. */
export function assertPaperIntakeQuality(extraction: PaperIntakeExtraction, paper: PaperText) {
  const labels = new Set<string>(), comparisons = new Set<string>();
  for (const entry of extraction.sections.validate) {
    if (entry.kind !== "claim") continue;
    if (!entry.label?.trim() || !entry.criterion) throw new Error("Every distinct paper claim needs a label and its own criterion.");
    const label = claimIdentity(entry.label), comparison = normalized(entry.criterion.metric) + ":" + normalized(entry.criterion.comparison);
    if (!label || labels.has(label) || comparisons.has(comparison)) throw new Error("Duplicate claim identity or metric/comparison: retain one criterion per distinct claim and put derived table arithmetic in Data.");
    if (entry.criterion.acceptance === "needs_definition" && entry.criterion.tolerance !== null) throw new Error("An unresolved agreement rule must retain a null tolerance; do not invent an acceptance threshold.");
    if (entry.criterion.acceptance === "paper_defined" && /\b(?:about|approximately|near|around|roughly)\b/iu.test(entry.criterion.target) && !numericAgreement(entry.criterion.tolerance)) throw new Error("An approximate numerical target needs an explicit numerical agreement rule or must remain unresolved.");
    labels.add(label); comparisons.add(comparison);
  }
  for (const entry of extraction.sections.data) {
    if (entry.kind === "reported_result" && !entry.description.startsWith("The paper reports ")) throw new Error("Attribute every reported result explicitly to the paper; collection requirements and independent measurements are separate.");
    if (extraction.provenance?.classification === "synthetic" && /^(?:(?:we|the authors|the researchers)\s+)?(?:collected|measured|observed|recorded)\b/iu.test(entry.description.trim())) throw new Error("Synthetic benchmark descriptions must not assert that empirical measurements were collected.");
  }
  const original = paper.pages.map(p => p.text).join("\n");
  for (const choice of extraction.implementation_choices ?? []) {
    const narrative = choice.name + " " + choice.reason, evidence = choice.citations.map(c => c.quote).join("\n");
    for (const term of PAPER_PARAMETER_TERMS) if (term.pattern.test(narrative) && term.pattern.test(original) && !term.pattern.test(evidence)) throw new Error(`The implementation choice names ${term.name}, but its citations omit the paper passage naming that parameter.`);
  }
}
