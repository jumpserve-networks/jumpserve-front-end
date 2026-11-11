import { requireAccessToken } from "./browser-auth";
import { researchRequest, ResearchRequestError, RESEARCH_SIGN_IN_REQUIRED } from "./research-workflow-api";
import { PAPER_INTAKE_PATH } from "./paper-intake";

export async function paperIntakeFetch<T>(query: string, options: RequestInit = {}, ownerId?: string): Promise<T> {
  const token = ownerId ? await requireAccessToken(RESEARCH_SIGN_IN_REQUIRED, ownerId) : null;
  const response = await fetch(`${PAPER_INTAKE_PATH}${query}`, { ...options, cache: "no-store", signal: options.signal ?? AbortSignal.timeout(110_000), headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new ResearchRequestError(result.error ?? `Paper request failed (HTTP ${response.status}).`, response.status);
  return result;
}

export function paperIntakeRequest<T>(path: string, options: RequestInit = {}, ownerId?: string): Promise<T> {
  if (path === "/capabilities") return paperIntakeFetch("?capabilities=1", options, ownerId);
  if (path === "/paper-uploads") return paperIntakeFetch("", options, ownerId);
  if (path === "/studies?mine=1&status=1") return paperIntakeFetch<T>("?mine=1", options, ownerId).catch(error => {
    if (error instanceof ResearchRequestError && error.status === 424) return researchRequest<T>(path, options, ownerId);
    throw error;
  });
  return researchRequest(path, options, ownerId);
}
