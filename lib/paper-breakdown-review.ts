import { isDeepStrictEqual } from "node:util";
import { sha256, type PaperText } from "./paper-intake-model";
import { validatePaperBreakdown, type PaperBreakdown } from "./research-paper-breakdown";

export const PAPER_REVIEW_INSTRUCTIONS = `Review the original retained PDF text against the phase-one extraction and the requested corrections. Preserve document provenance, including any explicit fabricated-data disclosure. Keep paper-reported values separate from independent measurements. Attach all retained passages needed to support each description, claim criterion and experiment specification, with their original PDF pages. Consolidate repeated setup and procedure descriptions into one specification for each actual experiment; a minimum subset and full grid of the same design are not separate experiments. Preserve unspecified implementation parameters as unresolved choices rather than attributing invented settings to the authors. Give each paper claim a separate metric, comparison, target and agreement rule; leave an unstated tolerance unresolved. Preserve the original PDF identity, text coverage, extraction, model request/response, budget, deadline and confirmed scope. This operator document review creates a versioned correction only; it does not confirm scope, invoke a model API or execute experiments.`;
export type PaperBreakdownCorrection = { review_id: string; base_revision: number; reason: string; reviewer_type: "AI" | "human"; instructions: string; breakdown: PaperBreakdown };
const uuid = (v: unknown) => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const text = (v: unknown, maximum: number) => typeof v === "string" && !!v.trim() && [...v].length <= maximum;
const mutable = new Set(["sections", "policy_sha256", "provenance", "implementation_choices", "reported_values_origin", "review"]);
const identity = (b: PaperBreakdown) => Object.fromEntries(Object.entries(b).filter(([key]) => !mutable.has(key)));

/** Bounded operator correction, checked again inside the service-only database RPC. */
export function validatePaperBreakdownCorrection(original: PaperBreakdown, paper: PaperText, value: unknown): PaperBreakdownCorrection {
  const fail = () => new Error("The correction must preserve the original identity and contain complete source-grounded reviewed evidence.");
  validatePaperBreakdown(original);
  const v = value as PaperBreakdownCorrection;
  if (!v || !uuid(v.review_id) || !Number.isSafeInteger(v.base_revision) || v.base_revision < 1 || !text(v.reason, 2000) || !["AI", "human"].includes(v.reviewer_type) || !text(v.instructions, 40000)) throw fail();
  const b = validatePaperBreakdown(v.breakdown);
  if (b.review || b.status !== "ready" || !b.provenance || !b.implementation_choices || !isDeepStrictEqual(identity(original), identity(b)) || b.policy_sha256 !== sha256(v.instructions)) throw fail();
  const citations = [...b.provenance.citations, ...b.implementation_choices.flatMap(c => c.citations)];
  for (const [section, items] of Object.entries(b.sections)) {
    if (items.length > 8) throw fail();
    for (const item of items) {
      if (!item.citations || !item.kind || section === "experiment" && item.kind !== "experiment_specification") throw fail();
      citations.push(...item.citations);
    }
  }
  for (const citation of citations) if (!paper.pages.find(p => p.page === citation.page)?.text.includes(citation.quote)) throw fail();
  return v;
}
