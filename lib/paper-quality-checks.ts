import type { PaperBreakdown } from "./research-paper-breakdown";
import { validatePaperBreakdown } from "./research-paper-breakdown";
import { validateExperimentPlan, type ExperimentPlan } from "./paper-experiment-plan";
import { validateExperimentScripts } from "./paper-experiment-scripts";
import { PAPER_QUALITY_VERSION, type PaperQualityChecks } from "./paper-quality";
import { qualityAttachment, type QualitySource } from "./paper-quality-model";
import { paperFieldDiagnostics } from "./paper-field-diagnostics";

export type QualityIntakeCandidate = { breakdown: PaperBreakdown; title: string | null; authors: string[]; domain: string | null };
export function deterministicQualityChecks(source: QualitySource): PaperQualityChecks {
  const source_sha256 = qualityAttachment(source).hash;
  try {
    if (source.step === 2) {
      const candidate = source.candidate as QualityIntakeCandidate;
      if (!candidate || !Array.isArray(candidate.authors) || candidate.authors.some(a => typeof a !== "string" || !a.trim() || a.length > 200) || ![candidate.title, candidate.domain].every(v => v === null || typeof v === "string" && v.trim() && v.length <= 300)) throw new Error("The reviewed paper metadata is invalid.");
      const breakdown = validatePaperBreakdown(candidate.breakdown), paper = source.paper as { totalPages: number; pages: { page: number; text: string }[] };
      const norm = (text: string) => text.replace(/\s+/g, " ").trim();
      if (!paper?.pages || breakdown.total_pages !== paper.totalPages || paper.pages.length !== paper.totalPages) throw new Error("The original complete paper text is required.");
      const citations = [...Object.values(breakdown.sections).flatMap(items => items.flatMap(item => item.citations ?? [{ page: item.page, quote: item.quote }])), ...(breakdown.provenance?.citations ?? []), ...(breakdown.implementation_choices ?? []).flatMap(choice => choice.citations)];
      for (const citation of citations) {
        const page = paper.pages.find(p => p.page === citation.page);
        if (!page || !norm(page.text).includes(norm(citation.quote))) throw new Error("A reviewed detail is not grounded in its original PDF page.");
      }
    } else if (source.step === 3) validateExperimentPlan(source.candidate, source.confirmed_breakdown as PaperBreakdown);
    else validateExperimentScripts(source.candidate, source.plan as ExperimentPlan, source.confirmed_breakdown as PaperBreakdown, source.experiment_index);
    return { version: PAPER_QUALITY_VERSION, passed: true, source_sha256, findings: [] };
  } catch (error) {
    let diagnostics: ReturnType<typeof paperFieldDiagnostics> = [];
    try { diagnostics = paperFieldDiagnostics(source); } catch { /* Malformed source still fails the original gate below. */ }
    return { version: PAPER_QUALITY_VERSION, passed: false, source_sha256, findings: [
      ...diagnostics.map((d, i) => ({ id: `field-${i + 1}`, severity: "blocking" as const, location: d.path || "/", explanation: d.message, evidence: `code=${d.code}; actual=${d.actual}${d.limit === undefined ? "" : `; limit=${d.limit}`}. The draft was not accepted.` })),
      { id: "source-validation", severity: "blocking", location: "Step " + source.step + " deterministic checks", explanation: "The draft failed its original source, format or coverage checks.", evidence: (error instanceof Error ? error.message : "Invalid draft.").slice(0, 2000) },
    ] };
  }
}
