import { requireAccessToken } from "@/lib/browser-auth";
import { researchApiBase } from "@/lib/research-workflow";
export async function researchRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = researchApiBase(process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL ?? process.env.NEXT_PUBLIC_BENCHMARK_API_URL);
  if (!base) throw new Error("The research workflow service is not configured. Your unsaved input remains in this form.");
  const token = await requireAccessToken();
  const controller = new AbortController();
  const relayAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) relayAbort();
  else options.signal?.addEventListener("abort", relayAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("Research request timed out. Refresh retained status before resuming; already saved records remain preserved.")), 35000);
  try {
    const response = await fetch(`${base}/research${path}`, { ...options, signal: controller.signal, cache: "no-store", headers: { ...options.headers, Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
    let result: T & { error?: string };
    try { result = await response.json(); } catch { if (controller.signal.aborted) throw controller.signal.reason; throw new Error(`The research service returned an unreadable response (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(result.error ?? `Research request failed (HTTP ${response.status}).`);
    return result;
  } finally { clearTimeout(timeout); options.signal?.removeEventListener("abort", relayAbort); }
}
