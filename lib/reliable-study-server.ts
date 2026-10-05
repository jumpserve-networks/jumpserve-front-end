import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readStudy, StudyQueryError } from "@/lib/delay-study-read";
import { normalizeReliable, type ReliableData, type ReliableRun } from "@/lib/reliable-study";
const fields = {
  meta: "id,analysis_version,assessment_sha256,review_definition,label_definitions,validation,counts,provenance,costs",
  campaigns: "id,title,stage,status,planned_runs,recorded_runs,experiment_type,elapsed_seconds,limitations,provenance,usage",
  configurations: "id,campaign_id,algorithm,skewness,budget_bytes,budget_regime,input_sha256,details,requested_resources,actual_resources",
  summaries: "configuration_id,campaign_id,planned,recorded,failed,excluded,statistics,interval_kind,observed_keys,query_population,zero_outlier_runs,lossless_runs,interval_valid_runs",
  sources: "reference_number,citation,doi,kind,role,source_url,retrieved_url,access_status,review_status,retrieved_version,sha256,byte_count,pages,findings,limitations,retrieval_attempts",
  claims: "id,location,description,assessment,evidence,limitation,proposed_check,required_inputs,feasibility",
  protocols: "id,version,stage,document,sha256,locked_at",
  published: "id,source_number,location,metric,values,units",
  controls: "id,stage,payload",
  runs: "id,campaign_id,configuration_id,protocol_id,stage,status,reason,algorithm,seed,input_sha256,raw_sha256,analysis_sha256,analysis_version,started_at,ended_at,measurements",
};
function checked<T>(r: { data: unknown; error: { message: string } | null; status?: number }): T {
  if (r.error) throw new StudyQueryError(r.error.message, r.status);
  return normalizeReliable(r.data) as T;
}
export const getReliableData = () => readStudy(async (): Promise<ReliableData | null> => {
  const db = await createClient();
  const meta = checked<ReliableData["meta"] | null>(await db.from("reliable_study_meta").select(fields.meta).eq("id", "assessment-v1").maybeSingle());
  if (!meta) return null;
  const names = ["campaigns", "configurations", "summaries", "sources", "claims", "protocols", "published", "controls"] as const;
  const responses = await Promise.all(names.map(name => db.from(`reliable_study_${name}`).select(fields[name], { count: "exact" }).order(name === "sources" ? "reference_number" : name === "summaries" ? "configuration_id" : "id").limit(1000)));
  const result: Record<string, unknown> = { meta };
  responses.forEach((response, i) => {
    const rows = checked<unknown[]>(response);
    if (rows.length !== response.count || rows.length !== meta.counts[names[i]]) throw new Error(`ReliableSketch ${names[i]} coverage mismatch`);
    result[names[i]] = rows;
  });
  return result as ReliableData;
});
export const getReliableRuns = (configuration?: string) => readStudy(async (): Promise<ReliableRun[]> => {
  if (configuration && !/^(main|followup)-zipf(0\.3|1\.2|3\.0)-(8192|32768|131072)-(RS|RS_raw|CM3|CM16|CU3|CU16)$/.test(configuration)) throw new Error("Invalid recorded configuration ID");
  const db = await createClient(); const rows: ReliableRun[] = []; let count: number | null = null;
  for (let offset = 0; offset < 2000; offset += 1000) {
    let query = db.from("reliable_study_runs").select(fields.runs, { count: "exact" }).order("id").range(offset, offset + 999);
    if (configuration) query = query.eq("configuration_id", configuration);
    const response = await query; const page = checked<ReliableRun[]>(response); count = response.count; rows.push(...page);
    if (page.length < 1000) break;
  }
  if (count !== rows.length) throw new Error("Truncated ReliableSketch run export");
  return rows;
});
