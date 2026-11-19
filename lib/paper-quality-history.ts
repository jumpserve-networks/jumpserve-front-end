import type { SupabaseClient } from "@supabase/supabase-js";
import { validateQualityHistory, validateQualityReview, type PaperQualityFinding, type PaperQualityHistoryEntry } from "./paper-quality";
import type { QualityWorkflow } from "./paper-quality-runner";

type HistoryCall = { id: string; position: number; kind: "review" | "repair"; status: PaperQualityHistoryEntry["status"]; created_at: string; updated_at: string };
type HistoryEvent = { call_id: string | null; status: string; review: unknown; check_findings: unknown; checks_passed: boolean | null; reason: string | null };
const finding = (f: PaperQualityFinding): PaperQualityFinding => ({ id: f.id, severity: f.severity, location: f.location, explanation: f.explanation, evidence: f.evidence });

/** Build recorded rounds, never infer that a repair resolved a finding. Events
 * arrive newest first. Requests, drafts, responses and provider IDs are excluded. */
export function projectQualityHistory(calls: HistoryCall[], events: HistoryEvent[]): PaperQualityHistoryEntry[] {
  if (calls.length > 7 || events.length > 16 || new Set(calls.map(c => c.id)).size !== calls.length) throw new Error("The bounded quality history is unavailable.");
  const ledger = new Map<string, string>();
  let previous: PaperQualityHistoryEntry | undefined;
  const history = [...calls].sort((a, b) => a.position - b.position).map(call => {
    const event = events.find(e => e.call_id === call.id && (call.kind === "review" ? ["repair_pending", "approved", "needs_attention"].includes(e.status) : ["review_pending", "needs_attention"].includes(e.status)));
    const reviewed = call.kind === "review" && call.status === "completed" && event?.review != null ? validateQualityReview(event.review) : null;
    const checks: PaperQualityFinding[] = reviewed && Array.isArray(event?.check_findings) ? event.check_findings : [];
    const terminal = ["completed", "failed", "cancelled"].includes(call.status);
    const entry: PaperQualityHistoryEntry = {
      position: call.position, kind: call.kind, round: Math.floor(call.position / 2) as PaperQualityHistoryEntry["round"], status: call.status,
      requested_at: call.created_at, completed_at: terminal ? call.updated_at : null,
      decision: reviewed?.decision ?? null, checks_passed: reviewed ? event?.checks_passed ?? null : null,
      summary: reviewed?.summary ?? null,
      reason: ["failed", "uncertain", "cancelled"].includes(call.status) ? events.find(e => e.call_id === call.id && ["needs_attention", "uncertain", "cancelled"].includes(e.status))?.reason ?? null : null,
      findings: (call.kind === "repair" ? previous?.findings ?? [] : reviewed?.findings ?? []).map(finding),
      check_findings: (call.kind === "repair" ? previous?.check_findings ?? [] : checks).map(finding),
      resolutions: (reviewed?.resolutions ?? []).map(r => {
        const location = ledger.get(r.key);
        if (!location) throw new Error("A prior quality finding is missing from recorded history.");
        return { key: r.key, status: r.status, evidence: r.evidence, location };
      }),
    };
    if (reviewed) {
      for (const f of entry.findings) ledger.set(`review-${call.position}:${f.id}`, f.location);
      for (const f of entry.check_findings) ledger.set(`check-${call.position}:${f.id}`, f.location);
    }
    if (call.kind === "review") previous = entry;
    return entry;
  });
  return validateQualityHistory(history);
}

/** The caller has loaded an owner-scoped workflow. Keep both reads bounded and
 * scoped to that same workflow/study; only calls also carry an owner column. */
export async function readQualityHistory(db: Pick<SupabaseClient, "from">, row: Pick<QualityWorkflow, "id" | "study_id" | "owner_id" | "call">) {
  if (!row.call) return [];
  const [calls, events] = await Promise.all([
    db.from("research_paper_quality_calls").select("id,position,kind,status,created_at,updated_at").eq("workflow_id", row.id).eq("study_id", row.study_id).eq("owner_id", row.owner_id).order("position").limit(8),
    db.from("research_paper_quality_events").select("call_id:snapshot->>current_call_id,status:snapshot->>status,review:snapshot->review,check_findings:snapshot->checks->findings,checks_passed:snapshot->checks->passed,reason:snapshot->>reason").eq("workflow_id", row.id).eq("study_id", row.study_id).eq("kind", "research_paper_quality_workflows").in("snapshot->>status", ["repair_pending", "review_pending", "approved", "needs_attention", "uncertain", "cancelled"]).order("id", { ascending: false }).limit(17),
  ]);
  if (calls.error || events.error || !calls.data || !events.data || calls.data.length > 7 || events.data.length > 16) throw new Error("The recorded quality history is temporarily unavailable.");
  const current = calls.data.find(c => c.id === row.call!.id);
  if (!current) throw new Error("The current saved quality call is missing from history.");
  const bounded = calls.data.filter(c => c.position <= current.position).map(c => c.id === row.call!.id ? { ...c, status: row.call!.status, updated_at: row.call!.updated_at } : c);
  return projectQualityHistory(bounded as HistoryCall[], events.data as unknown as HistoryEvent[]);
}
