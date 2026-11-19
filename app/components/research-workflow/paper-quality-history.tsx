import { LocalDateTime } from "@/app/components/user-preferences";
import { PAPER_QUALITY_MAX_REPAIRS, qualityReason, type PaperQualityFinding, type PaperQualityHistoryEntry, type PaperQualityProgress, type PaperQualityStep } from "@/lib/paper-quality";

const label = (entry: { kind: PaperQualityHistoryEntry["kind"]; round: number }) => entry.kind === "review" ? `Review ${entry.round + 1} of ${PAPER_QUALITY_MAX_REPAIRS + 1}` : `Repair ${entry.round} of ${PAPER_QUALITY_MAX_REPAIRS}`;
function status(entry: PaperQualityHistoryEntry) {
  if (entry.status === "completed") return entry.kind === "repair" ? "Saved for review" : entry.decision === "pass" && entry.checks_passed === true ? "Passed" : entry.decision === "revise" || entry.checks_passed === false ? "Changes requested" : "Completed; findings unavailable";
  return { preparing: "Preparing", submitting: "Submitting", processing: "In progress", failed: "Failed", uncertain: "Needs reconciliation", cancelled: "Cancelled" }[entry.status];
}
function Findings({ findings, checks, repair }: { findings: PaperQualityFinding[]; checks: PaperQualityFinding[]; repair: boolean }) {
  const rows = [...findings.map(finding => ({ finding, source: "Review" })), ...checks.map(finding => ({ finding, source: "Check" }))];
  return rows.length ? <ul aria-label={repair ? "Findings to address" : "Recorded findings"} className="space-y-3">
    {rows.map(({ finding: f, source }) => <li key={`${source}:${f.id}`} className="space-y-1">
      <p className="font-medium">{f.location}: {f.explanation}</p>
      <p className="text-xs text-muted-foreground">{source} · {f.severity === "blocking" ? "Blocking" : "Warning"}</p>
      <p className="text-muted-foreground">{f.evidence}</p>
    </li>)}
  </ul> : null;
}

export function PaperQualityHistory({ quality, step, showHeading = true }: { quality: PaperQualityProgress; step: PaperQualityStep; showHeading?: boolean }) {
  const history = quality.history ?? [], latest = history.at(-1);
  const reviewing = ["reviewing", "checking"].includes(quality.phase), repairing = quality.phase === "repairing";
  const currentPosition = 2 * quality.round + (repairing ? 2 : 1);
  const current = history.find(entry => entry.position === currentPosition);
  const progress = reviewing || repairing ? `${label({ kind: repairing ? "repair" : "review", round: repairing ? Math.min(quality.round + 1, PAPER_QUALITY_MAX_REPAIRS) : quality.round })} — ${current ? status(current) : "Queued"}` : quality.phase === "approved" ? null : qualityReason(quality.phase, step, quality.round);
  return <section aria-label="Paper quality checks" className="space-y-4 text-sm">
    {showHeading ? <h3 className="font-semibold">Review and repair history</h3> : null}
    {progress ? <p role={quality.phase === "needs_attention" ? "alert" : "status"}>{progress}</p> : null}
    <ol aria-label="Review and repair rounds" className="space-y-5">
      {history.map(entry => {
        const count = entry.findings.length + entry.check_findings.length;
        return <li key={entry.position} aria-current={entry.position === currentPosition && (reviewing || repairing) ? "step" : undefined} className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-medium">{label(entry)}</p><p className="text-muted-foreground">{status(entry)}</p></div>
          <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground"><span>Requested <LocalDateTime value={entry.requested_at} /></span>{entry.completed_at ? <span>{entry.kind === "repair" ? "Saved" : "Completed"} <LocalDateTime value={entry.completed_at} /></span> : null}</p>
          {entry.summary ? <p>{entry.summary}</p> : null}
          {entry.reason ? <p className="text-muted-foreground">{entry.reason}</p> : null}
          {entry.kind === "repair" && entry.status === "completed" ? <p className="text-muted-foreground">Repair saved. The next review verifies the findings below.</p> : null}
          {count || entry.resolutions.length ? <details open={entry.position === latest?.position} className="space-y-3">
            <summary className="cursor-pointer font-medium">{entry.kind === "repair" ? "Findings to address" : "Findings"} ({count}){entry.resolutions.length ? ` · Earlier findings checked (${entry.resolutions.length})` : ""}</summary>
            <Findings findings={entry.findings} checks={entry.check_findings} repair={entry.kind === "repair"} />
            {entry.resolutions.length ? <ul aria-label="Earlier finding outcomes" className="space-y-3">{entry.resolutions.map(r => <li key={r.key} className="space-y-1"><p className="font-medium">{r.location} · {r.status === "resolved" ? "Resolved" : r.status === "open" ? "Still open" : "Dismissed with evidence"}</p><p className="text-muted-foreground">{r.evidence}</p></li>)}</ul> : null}
          </details> : null}
        </li>;
      })}
    </ol>
  </section>;
}
