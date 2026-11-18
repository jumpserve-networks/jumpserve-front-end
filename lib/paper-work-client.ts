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
export async function advancePaperReviews(cursor: number, owner: string, signal: AbortSignal): Promise<number> {
  const token = await requireAccessToken("Sign in to continue saved paper quality checks.", owner);signal.throwIfAborted();
  const response = await fetch(PAPER_WORK_STATUS_PATH.replace(/paper-workflow$/, "paper-reviews"), { method: "POST", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(110000)]), headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ cursor }) });
  const value = await response.json();if (!response.ok) throw new Error(value.error ?? "Saved paper quality checks are temporarily unavailable.");
  if (value.version !== "paper-quality-v1" || !Number.isSafeInteger(value.next_cursor) || value.next_cursor < 0 || value.next_cursor > 9000) throw new Error("Background review progress could not be verified.");return value.next_cursor;
}
