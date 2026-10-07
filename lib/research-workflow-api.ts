import { requireAccessToken } from "@/lib/browser-auth";
import { researchApiBase } from "@/lib/research-workflow";
export async function researchRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = researchApiBase(process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL ?? process.env.NEXT_PUBLIC_BENCHMARK_API_URL);
  if (!base) throw new Error("The research workflow service is not configured. Your unsaved input remains in this form.");
  const token = await requireAccessToken();
  const response = await fetch(`${base}/research${path}`, { ...options, cache: "no-store", headers: { ...options.headers, Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
  let result: T & { error?: string };
  try { result = await response.json(); } catch { throw new Error(`The research service returned an unreadable response (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(result.error ?? `Research request failed (HTTP ${response.status}).`);
  return result;
}
