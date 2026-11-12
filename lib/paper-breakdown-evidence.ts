export type PaperCitation = { quote: string; page: number };
export const PAPER_ITEM_KINDS = ["requirement", "experiment_specification", "reported_result", "claim", "limitation"] as const;
export type PaperItemKind = typeof PAPER_ITEM_KINDS[number];
export type PaperCriterion = { metric: string; comparison: string; target: string; acceptance: "paper_defined" | "needs_definition"; tolerance: string | null };
export type PaperExperimentSpecification = { setup: string; conditions: string; procedure: string; comparisons: string };
export type PaperItemEvidence = { citations?: PaperCitation[]; kind?: PaperItemKind; label?: string | null; criterion?: PaperCriterion | null; specification?: PaperExperimentSpecification | null };
export type PaperProvenance = { classification: "synthetic" | "simulated" | "reported_empirical" | "unspecified"; statement: string | null; citations: PaperCitation[] };
export type PaperImplementationChoice = { name: string; reason: string; citations: PaperCitation[] };
export type PaperDocumentEvidence = { provenance?: PaperProvenance; implementation_choices?: PaperImplementationChoice[] };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const evidenceText = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && [...v].length <= max;
const keys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).sort().join(",") === [...names].sort().join(",");
export function validCitations(v: unknown, pages: number, missing: number[], minimum = 1): v is PaperCitation[] {
  return Array.isArray(v) && v.length >= minimum && v.length <= 12 && v.every(c => object(c) && keys(c, ["quote", "page"]) && evidenceText(c.quote, 800) && Number.isSafeInteger(c.page) && Number(c.page) > 0 && Number(c.page) <= pages && !missing.includes(Number(c.page))) && new Set(v.map(c => JSON.stringify([c.page, c.quote]))).size === v.length;
}
export function validItemEvidence(v: Record<string, unknown>, pages: number, missing: number[]) {
  if (!["citations", "kind", "label", "criterion", "specification"].some(k => k in v)) return true;
  if (!validCitations(v.citations, pages, missing) || v.quote !== v.citations[0].quote || v.page !== v.citations[0].page || !PAPER_ITEM_KINDS.includes(v.kind as PaperItemKind) || v.label !== null && !evidenceText(v.label, 120)) return false;
  if (v.kind === "experiment_specification") {
    if (!object(v.specification) || !keys(v.specification, ["setup", "conditions", "procedure", "comparisons"]) || !Object.values(v.specification).every(t => evidenceText(t, 600) && /[.!?]$/u.test(t.trim()))) return false;
  } else if (v.specification !== null) return false;
  if (v.kind !== "claim") return v.criterion === null;
  const c = v.criterion;
  return object(c) && keys(c, ["metric", "comparison", "target", "acceptance", "tolerance"]) && [c.metric, c.comparison, c.target].every(t => evidenceText(t, 300)) && ["paper_defined", "needs_definition"].includes(String(c.acceptance)) && (c.tolerance === null || evidenceText(c.tolerance, 200));
}
export function validDocumentEvidence(v: Record<string, unknown>, pages: number, missing: number[]) {
  if (!("provenance" in v) && !("implementation_choices" in v)) return true;
  const p = v.provenance, choices = v.implementation_choices;
  if (!object(p) || !keys(p, ["classification", "statement", "citations"]) || !["synthetic", "simulated", "reported_empirical", "unspecified"].includes(String(p.classification))) return false;
  if (p.classification === "unspecified" ? p.statement !== null || !Array.isArray(p.citations) || p.citations.length !== 0 : !evidenceText(p.statement, 400) || !validCitations(p.citations, pages, missing)) return false;
  return Array.isArray(choices) && choices.length <= 8 && choices.every(c => object(c) && keys(c, ["name", "reason", "citations"]) && evidenceText(c.name, 120) && evidenceText(c.reason, 400) && validCitations(c.citations, pages, missing)) && new Set(choices.map(c => c.name.toLowerCase().trim())).size === choices.length;
}
