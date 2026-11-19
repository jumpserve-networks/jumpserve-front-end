import { qualityReason, type PaperQualityProgress, type PaperQualityStep } from "@/lib/paper-quality";
import { PaperQualityHistory } from "./paper-quality-history";
import { PaperAgentHistory } from "./paper-agent-history";

/** The generated draft stays on the server until approved. These are bounded
 * findings, not the unreviewed output or the provider's private reasoning. */
export function PaperQualityFeedback({ quality, step }: { quality?: PaperQualityProgress; step: PaperQualityStep }) {
  if (!quality) return null;
  if (quality.history && (quality.history.length || ["reviewing", "repairing", "checking"].includes(quality.phase))) return <div className="space-y-5"><PaperQualityHistory quality={quality} step={step} />{quality.agent_history ? <PaperAgentHistory history={quality.agent_history} /> : null}</div>;
  const pending = ["waiting", "reviewing", "repairing", "checking"].includes(quality.phase);
  const reason = quality.phase === "approved" ? null : qualityReason(quality.phase, step, quality.round);
  if (!reason && !quality.findings.length && !quality.history_unavailable) return null;
  return <section aria-label="Paper quality checks" className="space-y-3 text-sm" aria-busy={pending}>
    {reason ? <p role={quality.phase === "needs_attention" ? "alert" : "status"}>{reason}</p> : null}
    {quality.history_unavailable ? <p className="text-muted-foreground">Review history is temporarily unavailable.</p> : null}
    {quality.findings.length ? <details open={quality.phase === "needs_attention"}><summary className="cursor-pointer font-medium">Review findings ({quality.findings.length})</summary><ul className="mt-3 space-y-3">
      {quality.findings.map(f => <li key={f.id}><p className="font-medium">{f.location}: {f.explanation}</p><p className="text-muted-foreground">{f.evidence}</p></li>)}
    </ul></details> : null}
    {quality.agent_history ? <PaperAgentHistory history={quality.agent_history} /> : null}
  </section>;
}
