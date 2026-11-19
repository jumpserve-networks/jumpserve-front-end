import OpenAI from "openai";
import type { AgentSession } from "openai/resources/beta/agents/agents";
import type { Turn } from "openai/resources/beta/agents/sessions/turns/turns";
import type { QualityWorkflow } from "./paper-quality-runner";
import { deterministicQualityChecks } from "./paper-quality-checks";
import { PAPER_AGENT_MAX_ACTIONS, PAPER_AGENT_EDIT_ACTIONS, paperAgentRequest, paperAgentTool, type PaperAgentAction, type PaperAgentRecord, type PaperAgentResult, type PaperAgentStopCode } from "./paper-agent";

export type PaperAgentOperations = {
  save: (operation: string, payload: Record<string, unknown>) => Promise<QualityWorkflow>;
  create: (request: NonNullable<PaperAgentRecord["request"]>, token: string) => Promise<AgentSession>;
  retrieve: (id: string) => Promise<AgentSession>;
  find: (call: string, token: string) => Promise<AgentSession[]>;
  turn: (id: string) => Promise<Turn | null>;
  items: (id: string) => Promise<unknown[]>;
  result: (id: string, turn: string, call: string, value: PaperAgentResult, key: string) => Promise<unknown>;
  cancel: (id: string, key: string) => Promise<unknown>;
  claim: (action: Record<string, unknown>) => Promise<PaperAgentAction>;
  limits: () => Promise<boolean>;
  now?: () => number;
};
const finalTurn = (turn: Turn | null) => Boolean(turn && ["completed", "failed", "cancelled"].includes(turn.status));
export class PaperAgentActionLimitError extends Error {
  readonly stopCode: "action_limit" | "no_progress";
  constructor(message = "The managed repair action limit was reached.", stopCode: "action_limit" | "no_progress" = "action_limit") { super(message); this.stopCode = stopCode; }
}
function sameSession(row: QualityWorkflow, session: AgentSession) {
  if (!row.call || session.metadata.call_id !== row.call.id || session.metadata.submit_token !== row.call.submit_token || session.agent.model !== "gpt-5.4" || session.agent.reasoning.effort !== "medium" || session.environment.type !== "none" || session.agent.multi_agent.enabled || row.agent?.provider_session_id && session.id !== row.agent.provider_session_id) throw new Error("The managed session does not match the retained repair identity and configuration.");
}
/** No hidden retry creates inference. Missing submission identities are recovered
 * only by exact retained metadata; function results are stored before ACK. */
export async function advancePaperAgent(row: QualityWorkflow, ops: PaperAgentOperations, advance = false): Promise<QualityWorkflow> {
  if (!row.agent || row.call?.provider_type !== "managed_agent") throw new Error("The retained managed repair state is missing.");
  if (["approved", "needs_attention", "cancelled"].includes(row.status)) return row;
  let current = row;
  const now = (ops.now ?? Date.now)();
  if (!current.agent!.provider_session_id) {
    if (current.agent!.status !== "preparing") {
      // A list read is a reconciliation operation, not permission to create a replacement.
      const matches = await ops.find(current.call!.id, current.call!.submit_token);
      if (matches.length > 1) throw new Error("More than one session matches the original repair submission. Reconcile it without replacement inference.");
      if (matches.length === 1) {
        sameSession(current, matches[0]);
        current = await ops.save("submitted", { session: matches[0] });
      } else if (now - Date.parse(current.agent!.updated_at) > 120000) return ops.save("uncertain", { reason: "The original managed repair submission is not yet identifiable. Its retained token will be reconciled without creating another session." });
      else return current;
    } else {
      if (!advance) return current;
      if (Date.parse(current.agent!.deadline_at) <= now) return ops.save("failed", { reason: "The original repair deadline expired before session creation." });
      if (!await ops.limits()) throw new Error("Managed repair cannot enforce this assessment's finite provider spending or model-call limit. No session was submitted.");
      current = await ops.save("request", { request: paperAgentRequest(current) });
      let session: AgentSession;
      try { session = await ops.create(current.agent!.request!, current.call!.submit_token); }
      catch (error) {
        if (error instanceof OpenAI.APIError && error.status && error.status >= 400 && error.status < 500 && ![408, 409].includes(error.status)) return ops.save("failed", { reason: "OpenAI rejected the managed repair request (HTTP " + error.status + "). Its original request is retained." });
        return ops.save("uncertain", { reason: "Managed repair submission was not acknowledged. The saved token will be reconciled; the request will not be repeated." });
      }
      sameSession(current, session);
      // A failed database acknowledgment must not turn a known ID into another session.
      try { return await ops.save("submitted", { session }); }
      catch { return ops.save("submitted", { session }); }
    }
  }
  const id = current.agent!.provider_session_id!, session = await ops.retrieve(id);
  sameSession(current, session);
  const turn = await ops.turn(id);
  current = await ops.save("observed", { session, turn });
  const stopping = Boolean(current.agent!.cancel_requested_at);
  if (finalTurn(turn) || session.status === "failed") {
    const items = await ops.items(id);
    if (turn?.status !== "completed" || stopping) {
      const code = current.agent!.stop_code;
      if (current.agent!.recovery_version === 1 && ["action_limit", "no_progress"].includes(code ?? "") && session.status === "idle" && finalTurn(turn) && current.agent!.candidate_version > 0 && JSON.stringify(current.agent!.candidate) !== JSON.stringify(current.agent!.initial_candidate) && Date.parse(current.agent!.deadline_at) > now && await ops.limits()) {
        const checks = deterministicQualityChecks({ ...current.source_json, candidate: current.agent!.candidate });
        if (checks.passed) {
          await ops.save("controller_checks", { checks });
          return ops.save("checkpoint", { session, turn, items, checks });
        }
      }
      const owner = code === "owner_cancel" || stopping && !code; // Legacy cancellation retains its original semantics.
      return ops.save(owner ? "cancelled" : "failed", { session, turn, items, reason: owner ? "The owner cancelled managed repair; provider stopping is confirmed." : code === "action_limit" ? "The repair action limit was reached. Its draft and findings are retained, but no valid improved checkpoint was eligible for independent review within the original limits." : code === "no_progress" ? "Three identical patch failures stopped this repair. The draft and exact validation findings are retained; no valid improved checkpoint was eligible for independent review within the original limits." : code === "deadline" ? "The original assessment deadline expired. The draft and evidence are retained." : code === "policy_change" ? "The current assessment limits stopped managed repair. Its draft and evidence are retained." : "The retained managed repair did not complete successfully; its draft and provider evidence are retained." });
    }
    const checks = deterministicQualityChecks({ ...current.source_json, candidate: current.agent!.candidate });
    if (!checks.passed) return ops.save("failed", { session, turn, items, reason: "The final managed draft failed its original source checks.", checks });
    await ops.save("controller_checks", { checks });
    return ops.save("completed", { session, turn, items, checks });
  }
  if (!advance) return current; // GET never returns a tool result or admits more inference.
  const stop = async (code: PaperAgentStopCode, reason: string) => {
    const saved = await ops.save("cancel_requested", { stop_code: code, reason });
    await ops.cancel(id, current.call!.submit_token + ":cancel");
    return saved;
  };
  const allowed = await ops.limits();
  if (stopping || !allowed || Date.parse(current.agent!.deadline_at) <= now) {
    if (!stopping) return stop(!allowed ? "policy_change" : "deadline", !allowed ? "The assessment's current finite limits do not admit managed continuation." : "The managed repair deadline expired.");
    await ops.cancel(id, current.call!.submit_token + ":cancel");
    return current; // HTTP acceptance is not cancellation completion.
  }
  const boundedStop = () => current.agent!.recovery_version === 1 && ((current.agent!.repeated_failures ?? 0) >= 3 ? "no_progress" : (current.agent!.actions_used ?? 0) >= PAPER_AGENT_EDIT_ACTIONS ? "action_limit" : null);
  const stopForBound = () => stop(boundedStop() || "action_limit", boundedStop() === "no_progress" ? "Three identical rejected patches without saved progress; stopping the provider to review the retained checkpoint." : "The repair action allowance is used; reserving the final actions for controller validation and a bounded independent review handoff.");
  if (boundedStop()) return stopForBound();
  let count = 0;
  for (const action of session.required_actions) {
    if (count++ >= 4) break; // Periodic server reconciliation also handles remaining pending calls.
    if (action.type !== "function_call") throw new Error("An environment-free repair requested an unavailable capability.");
    let claim: PaperAgentAction;
    try { claim = await ops.claim({ action }); }
    catch (error) {
      if (!(error instanceof PaperAgentActionLimitError)) throw error;
      return stop(error.stopCode, error.stopCode === "no_progress" ? "Three identical patch failures stopped further repair actions; preserve the saved checkpoint." : "The bounded managed repair action limit was reached.");
    }
    if (claim.workflow) current = claim.workflow;
    if (!claim.admitted && !claim.result) continue;
    let result = claim.result;
    if (!result) {
      const evaluated = paperAgentTool(current, { name: action.name, arguments: action.arguments });
      current = await ops.save("action_result", { action_id: claim.id, lease_token: claim.lease_token, candidate_version: claim.candidate_version, ...evaluated });
      result = evaluated.result;
    }
    if (boundedStop()) return stopForBound(); // Store result before stopping; never ACK it into further inference.
    await ops.result(id, action.turn_id, action.call_id, result, current.call!.submit_token + ":" + action.call_id);
  }
  return current;
}
export async function requestPaperAgentCancellation(row: QualityWorkflow, ops: PaperAgentOperations) {
  if (!row.agent?.provider_session_id) throw new Error("Reconcile the original managed session identity before confirming cancellation.");
  const current = await ops.save("cancel_requested", { stop_code: "owner_cancel", reason: "Owner requested managed repair cancellation." });
  await ops.cancel(row.agent.provider_session_id, row.call!.submit_token + ":cancel");
  return advancePaperAgent(current, ops, false);
}
export { PAPER_AGENT_MAX_ACTIONS };
