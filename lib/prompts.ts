import { TEST_MODULES } from "@/lib/test-modules";

export const PROMPTS_PATH = "/prompts";
export type PromptSummary = { id: string; module_id: string; version: string; content_sha256: string; created_at: string; updated_at: string; published_at: string | null; active: boolean };
export type PromptDetail = PromptSummary & { system_prompt: string; research_context: string };
export type PromptCatalog = { version: "prompt-catalog-v1"; prompts: PromptSummary[] };

const names: Record<string, string> = {
  "research-autonomy": "Assessment autonomy",
  "research-claim-design": "Claim design",
  "research-experiment-builder": "Experiment builder",
};
export const promptArea = (module: string) => names[module] ?? TEST_MODULES.find(item => item.id === module)?.name ?? module;
export const promptStatus = (prompt: PromptSummary) => prompt.active ? "Active" : prompt.published_at ? "Published" : "Draft";
export const promptPath = (id: string) => `${PROMPTS_PATH}/${encodeURIComponent(id)}`;
export const isPromptId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

function summary(value: unknown): value is PromptSummary {
  if (!value || typeof value !== "object") return false;
  const p = value as PromptSummary;
  return typeof p.id === "string" && isPromptId(p.id) && typeof p.module_id === "string" && /^[a-z0-9-]{1,120}$/.test(p.module_id) &&
    typeof p.version === "string" && p.version.trim().length > 0 && p.version.length <= 120 && typeof p.content_sha256 === "string" && /^[0-9a-f]{64}$/.test(p.content_sha256) &&
    typeof p.created_at === "string" && Number.isFinite(Date.parse(p.created_at)) && typeof p.updated_at === "string" && Number.isFinite(Date.parse(p.updated_at)) &&
    (p.published_at === null || typeof p.published_at === "string" && Number.isFinite(Date.parse(p.published_at))) && typeof p.active === "boolean" && (!p.active || p.published_at !== null);
}
const invalid = (): never => { throw new Error("The prompt service returned an invalid response."); };

export async function readPrompts(token: string, id?: string, fetcher: typeof fetch = fetch): Promise<PromptCatalog | { version: "prompt-catalog-v1"; prompt: PromptDetail }> {
  if (id !== undefined && !isPromptId(id)) invalid();
  if (!token) throw new Error("Sign in to view prompts.");
  const base = (process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL ?? process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL ?? process.env.NEXT_PUBLIC_BENCHMARK_API_URL)?.replace(/\/$/, "");
  if (!base) throw new Error("The prompt service is not configured.");
  const response = await fetcher(`${base}/research/prompts${id ? `/${id}` : ""}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(response.status === 404 ? id ? "Prompt version not found." : "The prompt service has not been released yet." : response.status === 401 || response.status === 403 ? "Sign in again to view prompts." : "The prompt service is temporarily unavailable.");
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > 1_000_000) invalid();
  let data;
  try { data = JSON.parse(raw); } catch { invalid(); }
  if (!data || data.version !== "prompt-catalog-v1") invalid();
  if (id) {
    if (!summary(data.prompt) || data.prompt.id !== id || typeof data.prompt.system_prompt !== "string" || typeof data.prompt.research_context !== "string") invalid();
    return data;
  }
  if (!Array.isArray(data.prompts) || data.prompts.length > 1000 || !data.prompts.every(summary) || new Set(data.prompts.map((p: PromptSummary) => p.id)).size !== data.prompts.length) invalid();
  return data;
}

// Some modules save named task prompts as JSON. Preserve the complete stored
// object, formatted for reading; never execute or render prompt text as HTML.
export function formatPrompt(text: string): string {
  try { const value: unknown = JSON.parse(text); return value && typeof value === "object" ? JSON.stringify(value, null, 2) : text; } catch { return text; }
}
