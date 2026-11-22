import { isResearchId } from "@/lib/research-experiment-queue";

export type AssessmentCursor = { created_at: string; id: string };

const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/;

export function decodeAssessmentCursor(value: string): AssessmentCursor | null {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;
  try {
    const row = JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/")));
    if (!row || Object.keys(row).length !== 2 || !isResearchId(row.id) || typeof row.created_at !== "string" ||
        !timestamp.test(row.created_at) || !Number.isFinite(Date.parse(row.created_at))) return null;
    return { created_at: row.created_at, id: row.id };
  } catch {
    return null;
  }
}

export function encodeAssessmentCursor({ created_at, id }: AssessmentCursor) {
  return btoa(JSON.stringify({ created_at, id })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function newestAssessmentFirst(a: AssessmentCursor, b: AssessmentCursor) {
  const micros = (date: string) => Number((timestamp.exec(date)?.[1] ?? "").padEnd(6, "0").slice(3));
  return Date.parse(b.created_at) - Date.parse(a.created_at) || micros(b.created_at) - micros(a.created_at) ||
    (a.id === b.id ? 0 : a.id > b.id ? -1 : 1);
}
