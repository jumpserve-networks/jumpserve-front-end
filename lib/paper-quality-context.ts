import { PAPER_BREAKDOWN_SECTIONS, type PaperBreakdown } from "./research-paper-breakdown";
import { validateQualityReview, type PaperQualityContext } from "./paper-quality";

/** These are the same one-based aliases used by planningSources and its validators.
 * Detail IDs are opaque; their zero-based suffixes never define plan references. */
export function qualityReferenceMap(breakdown: PaperBreakdown | null): Record<string, string> {
  return breakdown ? Object.fromEntries(PAPER_BREAKDOWN_SECTIONS.flatMap(({ id }) => breakdown.sections[id].map((item, index) => [`${id}-${index + 1}`, item.id]))) : {};
}

/** Database-owned context is frozen inside each request. Do not reconstruct the
 * ledger from the latest review alone, or drop findings that were once resolved. */
export function validateQualityContext(value: PaperQualityContext): PaperQualityContext {
  const fail = () => { throw new Error("The retained review context is missing or invalid."); };
  if (!value || Object.keys(value).sort().join(",") !== "finding_ledger,generation_input,generation_instructions,previous_candidate,prior_resolutions,reference_map,version" || value.version !== "paper-quality-context-v1" || typeof value.generation_instructions !== "string" || !value.generation_instructions.trim() || value.generation_instructions.length > 40000 || value.generation_input === undefined || !Array.isArray(value.finding_ledger) || value.finding_ledger.length > 128 || !value.reference_map || typeof value.reference_map !== "object" || Array.isArray(value.reference_map)) return fail();
  if (Object.entries(value.reference_map).some(([ref, id]) => !/^(access|experiment|data|validate)-[1-9][0-9]*$/.test(ref) || typeof id !== "string" || !id.trim() || id.length > 500)) return fail();
  const keys = new Set<string>();
  for (const entry of value.finding_ledger) {
    if (!entry || Object.keys(entry).sort().join(",") !== "finding,key" || typeof entry.key !== "string" || !entry.key.trim() || entry.key.length > 100 || keys.has(entry.key)) return fail();
    validateQualityReview({ decision: entry.finding?.severity === "blocking" ? "revise" : "pass", summary: "Prior finding.", findings: [entry.finding] });
    keys.add(entry.key);
  }
  validateQualityReview({ decision: "pass", summary: "Prior resolutions.", findings: [], resolutions: value.prior_resolutions });
  if (value.prior_resolutions.some(r => !keys.has(r.key))) return fail();
  return value;
}
