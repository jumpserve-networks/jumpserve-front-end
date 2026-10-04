import "server-only";
import { createClient } from "@/lib/supabase/server";
import { LEO_STUDY_ID, LEO_SATURATION_ID, normalizeLeoData, type LeoCampaign, type LeoConfiguration, type LeoSample, type LeoSummary, type LeoPaper, type LeoClaim } from "@/lib/leo-study";
import { readStudy, StudyQueryError } from "@/lib/delay-study-read";
function checked<T>(r: { data: unknown; error: { message: string } | null; status?: number }): T {
  if (r.error) throw new StudyQueryError(r.error.message, r.status);
  return normalizeLeoData(r.data) as T;
}
export const getLeoCampaign = (campaignId = LEO_STUDY_ID) => readStudy(async () => {
  const db = await createClient();
  return checked<LeoCampaign | null>(await db.from("leo_study_campaigns").select("id,title,status,protocol,protocol_sha256,artifact_commit,planned_samples,recorded_samples,limitations,provenance,created_at").eq("id", campaignId).maybeSingle());
});
const loadLeoData = (campaignId: string) => readStudy(async () => {
  const db = await createClient();
  const campaign = await getLeoCampaign(campaignId);
  if (!campaign) return null;
  if (campaign.planned_samples > 1000) throw new Error("Study exceeds the supported page size; refusing truncated results.");
  const [configs, samples, summaries] = await Promise.all([
    db.from("leo_study_configurations").select("id,country,constellation,satellites,requested_terminals,deployed_terminals,placement,beam_policy,ku_gbps,variant,cells,lost_capacity_gbps,published_capacity_gbps").eq("campaign_id", campaignId).order("id").limit(1000),
    db.from("leo_study_samples").select("id,configuration_id,second,capacity_gbps,rf_demand_gbps,cell_bound_gbps,failover_percent,served_cells,allocated_beams,validation_errors,graph_sha256,runner_sha256").eq("campaign_id", campaignId).order("configuration_id").order("second").limit(1000),
    db.from("leo_study_summaries").select("country,published_gbps,mean_gbps,min_gbps,max_gbps,relative_difference_percent,failover_percent,snapshots,assessment").eq("campaign_id", campaignId).order("country"),
  ]);
  const rows = checked<LeoSample[]>(samples);
  if (rows.length !== campaign.recorded_samples) throw new Error("Recorded study counts do not match retrieved samples; results may be truncated.");
  return { campaign, configurations: checked<LeoConfiguration[]>(configs), samples: rows, summaries: checked<LeoSummary[]>(summaries) };
});
export async function getLeoData() {
  const [primary, saturation] = await Promise.all([loadLeoData(LEO_STUDY_ID), loadLeoData(LEO_SATURATION_ID)]);
  return primary ? { ...primary, saturation } : null;
}
export const getLeoPapers = () => readStudy(async () => {
  const db = await createClient();
  return checked<LeoPaper[]>(await db.from("leo_study_papers").select("reference_number,citation,kind,source_url,download_status,reading_status,pages,sha256,version_note,reading_notes").eq("campaign_id", LEO_STUDY_ID).order("reference_number").limit(1000));
});
export const getLeoClaims = (campaignId = LEO_STUDY_ID) => readStudy(async () => {
  const db = await createClient();
  return checked<LeoClaim[]>(await db.from("leo_study_claims").select("claim_id,figure,description,coverage,limitation").eq("campaign_id", campaignId).order("claim_id"));
});
