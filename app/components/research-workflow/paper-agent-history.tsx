import { LocalDateTime } from "@/app/components/user-preferences";
import type { PaperAgentHistoryEntry } from "@/lib/paper-quality";
export function PaperAgentHistory({ history }: { history: PaperAgentHistoryEntry[] }) {
  if (!history.length) return null;
  return <section aria-label="Recorded repair actions" className="space-y-3 text-sm">
    <h3 className="font-semibold">Repair actions</h3>
    <ol className="space-y-3">{history.map(entry => <li key={`${entry.round}:${entry.position}`} className="space-y-1">
      <p className="font-medium">Repair {entry.round} · {entry.label}{entry.status === "running" ? " — In progress" : entry.status === "failed" ? " — Needs correction" : ""}</p>
      <p className="text-xs text-muted-foreground"><LocalDateTime value={entry.completed_at ?? entry.started_at} /></p>
      {entry.detail ? <p className="text-muted-foreground">{entry.detail}</p> : null}
    </li>)}</ol>
  </section>;
}
