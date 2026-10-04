import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readStudy, StudyQueryError } from "@/lib/delay-study-read";
import { HTTP2_CAMPAIGN, normalizeHttp2, type Http2Data, type Measurement } from "@/lib/http2-study";
const projections = {
 campaigns: "id,title,status,protocol,protocol_sha256,artifact_commit,analysis_sha256,planned_runs,recorded_runs,planned_measurements,limitations,provenance,costs",
 configurations: "id,proxy,version,mode,tls,details,requested_resources,actual_resources",
 runs: "id,configuration_id,protocol_id,stage,status,reason,source_path,raw_sha256,analysis_sha256,analysis_version,started_at,ended_at,original_execution_at,wall_seconds,units",
 summaries: "run_id,configuration_id,planned,recorded,missing,unknown,recoded,author_counts,preserved_counts,published_counts,published_source,assessment,scope_observed,scope_mismatches,comparisons",
 sources: "reference_number,citation,doi,kind,source_url,retrieved_url,download_status,review_status,retrieved_version,sha256,pages,findings,limitations,retrieval_audit",
 claims: "claim_id,location,description,assessment,evidence,limitation",
 followups: "id,stage,provenance,processes,planned,recorded,summary,costs",
 protocols: "id,version,stage,document,sha256,code_sha256,locked_at",
 measurements: "run_id,test_id,side,description,rfc_section,expected,expected_scope,author_outcome,outcome,status,reason,error_code,observed_scope,scope_compatible,preserved_rule_conformant",
 frames: "followup_id,id,replication,case_name,window_seconds,expected,expected_error_code,outcome,error_code,status,reason,agrees,started_at,ended_at,elapsed_seconds,raw_sha256,trace",
};
function checked<T>(r: { data: unknown; error: { message: string } | null; status?: number }): T {
  if (r.error) throw new StudyQueryError(r.error.message, r.status);
  return normalizeHttp2(r.data) as T;
}
export const getHttp2Data = () => readStudy(async (): Promise<Http2Data | null> => {
  const db = await createClient();
  const campaign = checked<Http2Data["campaign"] | null>(await db.from("http2_study_campaigns").select(projections.campaigns).eq("id", HTTP2_CAMPAIGN).maybeSingle());
  if (!campaign) return null;
  const names = ["configurations", "runs", "summaries", "sources", "claims", "followups"] as const;
  const replies = await Promise.all(names.map(name => db.from(`http2_study_${name}`).select(projections[name], { count: "exact" }).eq("campaign_id", HTTP2_CAMPAIGN).order(name === "summaries" ? "configuration_id" : name === "sources" ? "reference_number" : name === "claims" ? "claim_id" : "id").limit(1000)));
  const result: Record<string, unknown> = { campaign };
  replies.forEach((reply, i) => {
    const rows = checked<unknown[]>(reply);
    if (reply.count !== rows.length) throw new Error(`Incomplete HTTP/2 ${names[i]} page`);
    result[names[i]] = rows;
  });
  result.protocols = checked(await db.from("http2_study_protocols").select(projections.protocols).order("id").limit(100));
  const data = result as Http2Data;
  if (data.summaries.length !== campaign.recorded_runs || data.configurations.length !== campaign.planned_runs || data.sources.length !== 49) throw new Error("Study coverage does not match recorded counts");
  return data;
});
export const getHttp2Measurements = (runId?: string) => readStudy(async (): Promise<Measurement[]> => {
  if (runId !== undefined && !/^archive-\d{3}$/.test(runId)) throw new Error("Invalid archived run identifier");
  const db = await createClient();
  const rows: Measurement[] = []; let count: number | null = null;
  for (let offset = 0; offset < 10000; offset += 1000) {
    let query = db.from("http2_study_measurements").select(projections.measurements, { count: "exact" }).eq("campaign_id", HTTP2_CAMPAIGN).order("run_id").order("test_id").range(offset, offset + 999);
    if (runId) query = query.eq("run_id", runId);
    const reply = await query; const page = checked<Measurement[]>(reply); count = reply.count; rows.push(...page);
    if (page.length < 1000) break;
  }
  if (count !== rows.length) throw new Error("Incomplete HTTP/2 measurements; refusing truncated export");
  if (!runId && rows.length !== 7176) throw new Error("Archived measurement coverage mismatch");
  return rows;
});
export const getHttp2Frames = () => readStudy(async () => {
  const db = await createClient();
  const reply = await db.from("http2_study_frame_measurements").select(projections.frames, { count: "exact" }).order("followup_id").order("id").limit(1000);
  const data = checked<unknown[]>(reply);
  if (reply.count !== data.length) throw new Error("Truncated loopback export");
  return data;
});
