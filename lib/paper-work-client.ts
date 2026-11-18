import { requireAccessToken } from "./browser-auth";
import { PAPER_WORK_STATUS_PATH, validatePaperWorkListing } from "./paper-work-status";
export async function paperWorkStatus(cursor: number, owner: string, signal: AbortSignal) {
  const token = await requireAccessToken("Sign in to check background paper work.", owner);
  signal.throwIfAborted();
  const response = await fetch(`${PAPER_WORK_STATUS_PATH}?cursor=${cursor}`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(110000)]), headers: { Authorization: `Bearer ${token}` } });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Background paper status is unavailable.");
  return validatePaperWorkListing(value);
}
