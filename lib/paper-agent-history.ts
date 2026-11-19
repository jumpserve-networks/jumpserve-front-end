import type { SupabaseClient } from "@supabase/supabase-js";
import { validatePaperAgentHistory, type PaperAgentHistoryEntry } from "./paper-quality";
type Row = { repair_round: 1 | 2 | 3; position: number; name: string; status: "claimed" | "completed"; record: string | null; explanation: string | null; result_success: boolean | null; reason: string | null; checks_passed: boolean | null; created_at: string; completed_at: string | null };
const labels: Record<string, string> = { paper: "Read retained paper", draft: "Inspect current draft", confirmed_sections: "Read confirmed sections", source_plan: "Read saved experiment plan", review_findings: "Inspect review findings", generation_contract: "Read assessment instructions", normalization_contract: "Check assessment structure" };
export function projectPaperAgentHistory(rows: Row[]): PaperAgentHistoryEntry[] {
  return validatePaperAgentHistory(rows.map(row => ({
    round: row.repair_round, position: row.position, started_at: row.created_at, completed_at: row.completed_at,
    status: row.status === "claimed" ? "running" : row.result_success === false ? "failed" : "completed",
    label: row.name === "read_evidence" ? labels[row.record ?? ""] ?? "Inspect retained evidence" : row.name === "apply_patch" ? row.checks_passed === true ? "Save targeted draft edits" : "Check proposed draft edits" : row.name === "run_validator" ? row.checks_passed === true ? "Source checks passed" : "Check draft against retained sources" : "Record platform finding",
    detail: (row.result_success === false ? row.reason : row.name === "record_platform_issue" ? row.explanation : row.name === "apply_patch" && row.status === "completed" && row.checks_passed !== true ? "The proposed edit was not applied." : null)?.slice(0, 2000) || null,
  })));
}
export async function readPaperAgentHistory(db: Pick<SupabaseClient, "from">, row: { id: string; study_id: string; owner_id: string }) {
  const result = await db.from("research_paper_agent_actions").select("repair_round,position,name,status,record:arguments->>record,explanation:arguments->>explanation,result_success:result->success,reason:result->>error,checks_passed:checks->passed,created_at,completed_at").eq("workflow_id", row.id).eq("study_id", row.study_id).eq("owner_id", row.owner_id).order("repair_round").order("position").limit(73);
  if (result.error && ["42P01", "PGRST205"].includes(result.error.code)) return []; // Historical Responses-only deployments.
  if (result.error || !result.data) throw new Error("Repair action history is temporarily unavailable.");
  return projectPaperAgentHistory(result.data as unknown as Row[]);
}
