import { requireAccessToken } from "@/lib/browser-auth";
import { researchApiBase } from "@/lib/research-workflow";
import { IDEA_VERSION, type IdeaRun } from "@/lib/research-ideas";

export async function ideaModelRequest(body: Record<string, unknown>, signal?: AbortSignal): Promise<{ run: IdeaRun }> {
  const origin = researchApiBase(process.env.NEXT_PUBLIC_AGENT_URL);
  if (!origin) throw new Error("Idea AI is not configured. Your saved packet remains available.");
  const token = await requireAccessToken();
  const controller = new AbortController();
  const relay = () => controller.abort(signal?.reason);
  if (signal?.aborted) relay(); else signal?.addEventListener("abort", relay, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("AI request timed out. Refresh retained attempts before requesting another call.")), 90000);
  async function request(payload: Record<string, unknown>) {
    const response = await fetch(origin!, { method: "POST", signal: controller.signal, cache: "no-store", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    let result;
    try { result = await response.json(); } catch { throw new Error(`Idea AI returned an unreadable response (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(result.error ?? `Idea AI request failed (HTTP ${response.status}).`);
    return result;
  }
  try {
    const capabilities = await request({ action: "capabilities" });
    if (capabilities.research_ideas?.version !== IDEA_VERSION) throw new Error("This AI service does not yet support the idea flow. No model call was requested.");
    const result = await request({ ...body, action: "idea" });
    if (!result.run || result.run.id !== body.request_id || result.run.study_id !== body.study_id || result.run.packet_id !== body.packet_id || result.run.task !== body.task) throw new Error("AI attempt identity was not confirmed. Refresh retained history before continuing.");
    return result;
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", relay); }
}
