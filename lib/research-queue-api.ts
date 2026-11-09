type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
type Capabilities = { preparation?: { gap_queue_version?: string } };
export const GAP_BACKEND_REQUIRED = "The connected research backend has not released evidence-gap experiment launching yet. Existing jobs are available in Experiment Queue; new gap launches require the backend update.";

export async function requireGapQueueApi(request: Request, signal?: AbortSignal) {
  const capabilities = await request<Capabilities>("/capabilities", { signal });
  if (capabilities.preparation?.gap_queue_version !== "research-gap-queue-v1") throw new Error(GAP_BACKEND_REQUIRED);
}
