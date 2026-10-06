import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readStudy, StudyQueryError } from "@/lib/delay-study-read";
import { normalizeReliable } from "@/lib/reliable-study";
import type { IPv6Data } from "@/lib/ipv6-study";
const fields = {
 meta: "analysis_version,assessment_sha256,review_definition,label_definitions,validation,counts,provenance,costs",
 configurations: "id,case_id,cohort,mtu,upstream,family,edns_bytes,details",
 summaries: "id,configuration_id,epoch,statistics,interval_kind",
 comparisons: "id,configuration_id,epoch,metric,reproduced,published,difference_pp,assessment,valid_days,planned_days",
 sources: "reference_number,citation,doi,kind,role,source_url,retrieved_url,access_status,review_status,retrieved_version,sha256,byte_count,pages,findings,limitations,retrieval_attempts",
 claims: "id,location,description,assessment,evidence,limitation,proposed_check,required_inputs,feasibility",
 runs: "id,epoch,status,reason,original_execution_date,raw_sha256,analysis_sha256,started_at,ended_at",
 protocols: "id,version,document,sha256,locked_at",
 campaigns: "id,title,stage,status,experiment_type,planned_runs,recorded_runs,limitations,usage",
 controls: "id,status,reason,payload",
};
function checked<T>(r: { data: unknown; error: { message: string } | null; status?: number }): T {
 if (r.error) throw new StudyQueryError(r.error.message, r.status);
 return normalizeReliable(r.data) as T;
}
export const getIPv6Data = () => readStudy(async (): Promise<IPv6Data | null> => {
 const db = await createClient();
 const meta = checked<IPv6Data["meta"] | null>(await db.from("ipv6_study_meta").select(fields.meta).eq("id", "assessment-v2").maybeSingle());
 if (!meta) return null;
 const names = ["configurations", "summaries", "comparisons", "sources", "claims", "runs", "protocols", "campaigns", "controls"] as const;
 const entries = await Promise.all(names.map(async name => {
  const rows: unknown[] = []; let count: number | null = null;
  for (let offset = 0; offset < 2000; offset += 1000) {
   const response = await db.from(`ipv6_study_${name}`).select(fields[name], { count: "exact" }).order(name === "sources" ? "reference_number" : "id").range(offset, offset + 999);
   const page = checked<unknown[]>(response); count = response.count; rows.push(...page);
   if (page.length < 1000) break;
  }
  if (rows.length !== count || rows.length !== meta.counts[name]) throw new Error(`IPv6 ${name} coverage mismatch`);
  return [name, rows];
 }));
 return { meta, ...Object.fromEntries(entries) } as IPv6Data;
});
