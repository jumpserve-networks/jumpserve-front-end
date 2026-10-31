import { parsePlatformControl, parsePlatformSnapshot, type PlatformControl, type PlatformRead } from "@/lib/platform-updates";

type Reply = { data: unknown; error: { code?: string; message?: string } | null };
export type PlatformClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<Reply> };
export async function readPlatform(client: PlatformClient, task: string | null = null, beforeEvent: string | null = null, beforeTask: string | null = null): Promise<PlatformRead> {
  const { data, error } = await client.rpc("platform_snapshot", { p_task: task, p_before_event: beforeEvent, p_before_task: beforeTask });
  if (error) return error.code === "42501" ? { status: "forbidden", reason: "Your Google account is not a platform operator." } : { status: "unavailable", reason: "Platform records are unavailable. The supervisor may still need to be installed or reconnected." };
  try { return { status: "available", data: parsePlatformSnapshot(data) }; } catch { return { status: "unavailable", reason: "The platform returned incomplete status records. Earlier recorded history is retained." }; }
}
export async function controlPlatform(client: PlatformClient, body: PlatformControl) {
  const input = parsePlatformControl(body);
  const { data, error } = await client.rpc("platform_control", { p_action: input.action, p_request: input.request_id, p_task: input.task_id, p_payload: input.payload });
  if (error) throw new Error(error.code === "42501" ? "Platform owner access is required." : "The control request is unconfirmed. Retry the same request identity to reconcile it.");
  return data;
}
