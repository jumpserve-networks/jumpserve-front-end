import "server-only";
import { researchApiBase, validateSnapshot, type ResearchSnapshot, type ResearchStudy } from "@/lib/research-workflow";
export type ResearchRead<T> = { status: "available"; data: T } | { status: "unavailable" | "not-found"; reason: string };
function origin() {
  return researchApiBase(process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL ?? process.env.NEXT_PUBLIC_BENCHMARK_API_URL);
}
async function publicRead<T>(path: string): Promise<ResearchRead<T>> {
  try {
    const base = origin();
    if (!base) return { status: "unavailable", reason: "The research workflow service is not configured. No study coverage is inferred." };
    const response = await fetch(`${base}/research${path}`, { cache: "no-store", signal: AbortSignal.timeout(20000), headers: { Accept: "application/json" } });
    if (response.status === 404) return { status: "not-found", reason: "This study has no public assessment, or the workflow service has not been released." };
    if (!response.ok) return { status: "unavailable", reason: `The research service is unavailable (HTTP ${response.status}). Missing results are not zero.` };
    return { status: "available", data: await response.json() as T };
  } catch { return { status: "unavailable", reason: "The research service could not return complete data. No truncated result is presented as a completed study." }; }
}
export function getResearchStudies() { return publicRead<{ studies: ResearchStudy[]; has_more: boolean }>("/studies"); }
export async function getResearchSnapshot(id: string): Promise<ResearchRead<ResearchSnapshot>> {
  if (!/^[a-f0-9-]{36}$/i.test(id)) return { status: "not-found", reason: "Invalid study identifier." };
  const result = await publicRead<ResearchSnapshot>(`/studies/${id}`);
  if (result.status !== "available") return result;
  try { return { status: "available", data: validateSnapshot(result.data) }; }
  catch { return { status: "unavailable", reason: "The returned study has incomplete or invalid coverage. Its claim counts are unavailable." }; }
}
