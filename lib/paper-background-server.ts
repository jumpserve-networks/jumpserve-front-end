import "server-only";
import { intakeDatabase, loadIntake, prepareIntake, modelClient } from "./paper-intake-server";
import OpenAI from "openai";
import type { PaperAgentRecord } from "./paper-agent";
import { loadExperimentPlan, refreshPlan } from "./paper-experiment-plan-server";
import { loadExperimentScripts, refreshExperimentScripts } from "./paper-experiment-scripts-server";
import { drivePaperQuality, loadPaperQuality } from "./paper-quality-server";
import type { PaperQualityStep } from "./paper-quality";

type BackgroundItem = { work_key: string; kind: "intake" | "plan" | "scripts" | "quality" | "agent_cleanup"; study_id: string; owner_id: string; workflow_id: string | null; experiment_index: number; lease_token: string };
async function control(operation: string, payload: Record<string, unknown>) {
  const { data, error } = await (await intakeDatabase()).rpc("research_paper_background_control", { p_operation: operation, p_payload: payload });
  if (error) throw new Error("The durable paper continuation service is temporarily unavailable.");
  return data;
}
export async function enqueuePaperProvider(providerId: string) { await control("enqueue_provider", { provider_id: providerId }); }
async function cleanupPaperAgent(call: string) {
  const db = await intakeDatabase();
  const rpc = async (operation: string, payload: Record<string, unknown> = {}) => {
    const { data, error } = await db.rpc("research_paper_agent_cleanup_control", { p_operation: operation, p_call: call, p_payload: payload });
    if (error) throw new Error("The original provider cleanup evidence could not be retained.");return data;
  };
  const context = await rpc("context") as { session: PaperAgentRecord; done: boolean };
  if (context.done) return;
  const retained = context.session, provider = (await modelClient()).beta.agents.sessions, id = retained.provider_session_id!;
  let receipt: Record<string, unknown>;
  try {
    const session = await provider.retrieve(id);
    const latest = (await provider.turns.list(id, { limit: 1, order: "desc" })).data[0];
    if (session.metadata.call_id !== retained.call_id || session.metadata.submit_token !== retained.submit_token || !["idle", "failed"].includes(session.status) || latest && (latest.id !== retained.turn?.id || !["completed", "failed", "cancelled"].includes(latest.status))) throw new Error("The provider session no longer matches its retained terminal work.");
    if (!session.usage && Date.now() - Date.parse(retained.updated_at) < 300_000) throw new Error("Provider usage is not yet available; reconcile it before cleanup.");
    const deleted = await provider.delete(id);
    if (!deleted.deleted || deleted.id !== id) throw new Error("Provider deletion is not confirmed.");
    receipt = { ...deleted, usage: session.usage, turn_usage: latest?.usage ?? null, usage_unavailable_at_deletion: !session.usage };
  } catch (error) {
    if (!(error instanceof OpenAI.APIError) || error.status !== 404) throw error;
    receipt = { id, retrieval_http_status: 404, request_id: error.requestID ?? null };
  }
  await rpc("record", { receipt });
}
export async function continuePaperBackground(limit = 2) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2) throw new Error("A bounded continuation batch is required.");
  const work = await control("claim", { limit }) as BackgroundItem[];
  let advanced = 0, unavailable = 0;
  const results = await Promise.allSettled(work.map(async item => {
    let failed = false;
    try {
      if (item.kind === "intake") {
        const row = await loadIntake(item.study_id, item.owner_id);
        if (row) await prepareIntake(row);
      } else if (item.kind === "plan") {
        const row = await loadExperimentPlan(item.study_id, item.owner_id);
        if (row) await refreshPlan(row);
      } else if (item.kind === "scripts") {
        const row = await loadExperimentScripts(item.study_id, item.owner_id, item.experiment_index);
        if (row) await refreshExperimentScripts(row);
      } else if (item.kind === "quality") {
        const { data, error } = await (await intakeDatabase()).from("research_paper_quality_workflows").select("step").eq("id", item.workflow_id!).eq("study_id", item.study_id).eq("owner_id", item.owner_id).maybeSingle();
        if (error) throw new Error("The retained workflow could not be read.");
        if (data) {
          const row = await loadPaperQuality(item.study_id, item.owner_id, data.step as PaperQualityStep, item.experiment_index);
          if (row) await drivePaperQuality(row, true);
        }
      } else if (item.kind === "agent_cleanup" && item.workflow_id) await cleanupPaperAgent(item.workflow_id);
      else throw new Error("Unsupported background intent.");
      advanced++;
    } catch { failed = true;unavailable++; } // Keep original identities; do not replay unknown submissions.
    await control("release", { work_key: item.work_key, lease_token: item.lease_token, failed });
  }));
  for (const result of results) if (result.status === "rejected") unavailable++;
  return { version: "paper-background-v1", advanced, unavailable };
}
