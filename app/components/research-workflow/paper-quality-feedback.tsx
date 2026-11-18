import { qualityReason, type PaperQualityProgress, type PaperQualityStep } from "@/lib/paper-quality";

/** The generated draft stays on the server until approved. These are bounded
 * findings, not the unreviewed output or the provider's private reasoning. */
export function PaperQualityFeedback({ quality, step }: { quality?: PaperQualityProgress; step: PaperQualityStep }) {
  if (!quality) return null;
  const pending = ["waiting", "reviewing", "repairing", "checking"].includes(quality.phase);
  return <section aria-label="Paper quality checks" className="space-y-3 text-sm" aria-busy={pending}>
    {quality.phase !== "approved" ? <p role={quality.phase === "needs_attention" ? "alert" : "status"}>{qualityReason(quality.phase, step, quality.round)}</p> : null}
    {quality.findings.length ? <details open={quality.phase === "needs_attention"}><summary className="cursor-pointer font-medium">Review findings ({quality.findings.length})</summary><ul className="mt-3 space-y-3">
      {quality.findings.map(f => <li key={f.id}><p className="font-medium">{f.location}: {f.explanation}</p><p className="text-muted-foreground">{f.evidence}</p></li>)}
    </ul></details> : null}
  </section>;
}
