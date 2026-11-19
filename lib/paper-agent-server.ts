import "server-only";
import { advancePaperAgent, requestPaperAgentCancellation, PaperAgentActionLimitError, type PaperAgentOperations } from "./paper-agent-runner";
import type { PaperAgentAction } from "./paper-agent";
import type { QualityWorkflow } from "./paper-quality-runner";
import { intakeDatabase, modelClient } from "./paper-intake-server";
import { PaperQualityError } from "./paper-quality-server";

function failure(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (/action limit reached/.test(error.message)) throw new PaperAgentActionLimitError("The managed repair action limit was reached.");
  if (/finite|provider limit/i.test(error.message)) throw new PaperQualityError("Managed repair needs provider-enforced limits for this assessment's finite budget. The original limits and evidence are retained.", 424);
  throw new PaperQualityError(["42P01", "PGRST202", "PGRST205"].includes(error.code ?? "") ? "Managed paper repair needs the database agent-runtime update." : "Managed repair evidence could not be saved. Its original identity is retained.", ["42P01", "PGRST202", "PGRST205"].includes(error.code ?? "") ? 424 : 503);
}
export async function assertPaperAgentRuntime() {
  const { data, error } = await (await intakeDatabase()).rpc("research_paper_agent_capabilities", {});
  failure(error);
  if (data?.runtime !== "managed-agents-v1" || data?.native_records !== true) throw new PaperQualityError("Managed paper repair needs the matching database runtime update.", 424);
}
export function paperAgentOperations(row: QualityWorkflow): PaperAgentOperations {
  const rpc = async (operation: string, payload: Record<string, unknown> = {}) => {
    const { data, error } = await (await intakeDatabase()).rpc("research_paper_agent_control", { p_operation: operation, p_actor: row.owner_id, p_call: row.call!.id, p_payload: payload });
    failure(error);return data;
  };
  return {
    save: async (operation, payload) => rpc(operation, payload) as Promise<QualityWorkflow>,
    claim: async payload => rpc("action_claim", payload) as Promise<PaperAgentAction>,
    limits: async () => Boolean(await rpc("limits")),
    create: async (request, token) => (await modelClient()).beta.agents.sessions.create(request, { headers: { "X-Client-Request-Id": token } }),
    retrieve: async id => (await modelClient()).beta.agents.sessions.retrieve(id),
    find: async (call, token) => {
      const page = await (await modelClient()).beta.agents.sessions.list({ limit: 2, metadata: { runtime: "managed-agents-v1", call_id: call, submit_token: token } });
      if (page.hasNextPage()) throw new Error("The original managed session identity is ambiguous.");
      return page.data;
    },
    turn: async id => (await (await modelClient()).beta.agents.sessions.turns.list(id, { limit: 1, order: "desc" })).data[0] ?? null,
    items: async id => {
      const result: unknown[] = [];
      let page = await (await modelClient()).beta.agents.sessions.items.list(id, { limit: 100, order: "asc" });
      for (;;) {
        for (const item of page.data) {
          if (result.length >= 256 || Buffer.byteLength(JSON.stringify(item)) > 2_000_000) throw new Error("A managed history item exceeds the bounded evidence projection; its original identity is retained.");
          result.push(await rpc("history_item", { item })); // Full originals, one immutable row per item.
        }
        if (!page.hasNextPage()) return result;
        page = await page.getNextPage();
      }
    },
    result: async (id, turn, call, result, key) => {
      if (await rpc("action_ack", { turn_id: turn, call_id: call }) !== true) return; // A concurrent stop must not knowingly resume inference.
      return (await modelClient()).beta.agents.sessions.events.create(id, { events: [{ type: "agent.session.input.tool_result", turn_id: turn, call_id: call, ...result }] }, { headers: { "Idempotency-Key": key } });
    },
    cancel: async (id, key) => (await modelClient()).beta.agents.sessions.events.create(id, { events: [{ type: "agent.session.input.cancel" }] }, { headers: { "Idempotency-Key": key } }),
  };
}
export const driveManagedPaperRepair = (row: QualityWorkflow, advance = false) => advancePaperAgent(row, paperAgentOperations(row), advance);
export const cancelManagedPaperRepair = (row: QualityWorkflow) => requestPaperAgentCancellation(row, paperAgentOperations(row));
