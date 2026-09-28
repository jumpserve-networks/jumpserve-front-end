import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readStudy, StudyQueryError } from "@/lib/delay-study-read";
import { STUDY_ID, normalizeStudyData, type StudyCampaign, type StudyConfig, type StudyTrial, type StudySummary, type StudyLatency, type StudyPaper, type StudyClaim, type StudyFlow, type StudySample } from "@/lib/delay-study";

const TRIAL_COLUMNS = "id,configuration_id,block_index,replicate,attempt_id,status,start_order,kernel_release,runner_sha256,started_at,finished_at,validation_errors,error";
function checked<T>(response: { data: unknown; error: { message: string } | null; status?: number }): T {
  if (response.error) throw new StudyQueryError(response.error.message, response.status);
  return normalizeStudyData(response.data) as T;
}
async function loadStudyCampaign() {
  const db = await createClient();
  return checked<StudyCampaign | null>(await db.from("delay_study_campaigns").select("id,title,status,protocol,protocol_sha256,manifest_sha256,kernel_commit,planned_trials,bootstrap_replicates,random_seed,limitations,provenance,created_at,finished_at").eq("id", STUDY_ID).maybeSingle());
}
async function loadStudyData() {
  const db = await createClient();
  const [campaign, configurations, trials, summaries, latency] = await Promise.all([
    loadStudyCampaign(),
    db.from("delay_study_configurations").select("id,family,treatment,cca_group,capacity_mbps,queue_packets,duration_seconds,warmup_seconds,target_rtt_ms,delay_study_config_flows(flow_index,cca,configured_base_rtt_ms),delay_study_cells(flow_index,matched_repetitions,mean_goodput_mbps,ci_low_mbps,ci_high_mbps,mean_share)").eq("campaign_id", STUDY_ID).order("id"),
    db.from("delay_study_trials").select(TRIAL_COLUMNS).eq("campaign_id", STUDY_ID).order("block_index").order("id").limit(1000),
    db.from("delay_study_summaries").select("family,cca_group,flow_index,cca,baseline_delta,baseline_ci_low,baseline_ci_high,treatment_delta,treatment_ci_low,treatment_ci_high,improvement,improvement_ci_low,improvement_ci_high,assessment,matched_pairs,expected_pairs,observed_assignments,expected_assignments,unbounded,analysis_sha256").eq("campaign_id", STUDY_ID).order("flow_index"),
    db.from("delay_study_latency_trials").select("worker_index,treatment,sent_packets,received_packets,median_forward_ms,median_rtt_ms,validation_passed").eq("campaign_id", STUDY_ID).order("worker_index").order("treatment"),
  ]);
  if (!campaign) return null;
  const trialRows = checked<StudyTrial[]>(trials);
  if (campaign.planned_trials > 1000 || trialRows.length !== campaign.planned_trials) throw new Error("The study schedule is incomplete; refusing to display truncated trial counts.");
  return { campaign, configurations: checked<StudyConfig[]>(configurations), trials: trialRows, summaries: checked<StudySummary[]>(summaries), latency: checked<StudyLatency[]>(latency) };
}
async function loadStudyPapers() {
  const db = await createClient();
  return checked<StudyPaper[]>(await db.from("delay_study_papers").select("reference_number,citation,kind,source_url,download_status,reading_status,pages,sha256,version_note,reading_notes").eq("campaign_id", STUDY_ID).order("reference_number"));
}
async function loadStudyClaims() {
  const db = await createClient();
  return checked<StudyClaim[]>(await db.from("delay_study_claims").select("claim_id,figure,description,published_values,coverage,limitation").eq("campaign_id", STUDY_ID).order("figure"));
}
async function loadStudyTrial(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const db = await createClient();
  const trial = checked<StudyTrial | null>(await db.from("delay_study_trials").select(TRIAL_COLUMNS).eq("campaign_id", STUDY_ID).eq("id", id).maybeSingle());
  if (!trial) return null;
  const [flows, samples, config, paired] = await Promise.all([
    db.from("delay_study_flows").select("flow_index,cca,configured_base_rtt_ms,natural_min_rtt_ms,added_ack_delay_ms,effective_min_rtt_ms,goodput_mbps,measured_seconds,received_bytes,retransmits").eq("trial_id", id).order("flow_index"),
    db.from("delay_study_samples").select("flow_index,snapshot_index,start_seconds,end_seconds,interval_seconds,received_bytes,goodput_mbps").eq("trial_id", id).order("snapshot_index").order("flow_index").limit(1000),
    db.from("delay_study_configurations").select("id,family,treatment,cca_group,capacity_mbps,queue_packets,duration_seconds,warmup_seconds,target_rtt_ms,delay_study_config_flows(flow_index,cca,configured_base_rtt_ms),delay_study_cells(flow_index,matched_repetitions,mean_goodput_mbps,ci_low_mbps,ci_high_mbps,mean_share)").eq("campaign_id", STUDY_ID).eq("id", trial.configuration_id).single(),
    db.from("delay_study_trials").select(TRIAL_COLUMNS).eq("campaign_id", STUDY_ID).eq("block_index", trial.block_index).neq("id", id).maybeSingle(),
  ]);
  return { trial, flows: checked<StudyFlow[]>(flows), samples: checked<StudySample[]>(samples), configuration: checked<StudyConfig>(config), paired: checked<StudyTrial | null>(paired) };
}

export const getStudyCampaign = () => readStudy(loadStudyCampaign);
export const getStudyData = () => readStudy(loadStudyData);
export const getStudyPapers = () => readStudy(loadStudyPapers);
export const getStudyClaims = () => readStudy(loadStudyClaims);
export const getStudyTrial = (id: string) => readStudy(() => loadStudyTrial(id));
