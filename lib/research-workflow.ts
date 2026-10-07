export const CLAIM_LABELS = {
  reproduced: "The declared check meets its criterion under recorded conditions; broader validity is not implied.",
  discrepant: "Examined evidence conflicts with the claim or declared criterion; comparability limits remain explicit.",
  inconclusive: "Relevant evidence was examined but cannot resolve the claim within the declared scope.",
  untested: "No adequate check has been completed; a plan or citation is not a test.",
} as const;
export type ClaimLabel = keyof typeof CLAIM_LABELS;
export type ResearchStudy = { id: string; title: string; paper_url: string; domain: string; scope: string; origin_module: string | null; created_at: string };
export type ResearchRecord = { id: string; study_id: string; created_at: string; [key: string]: unknown };
export const RECORD_KINDS = ["sources", "claims", "protocols", "configurations", "campaigns", "claim_checks", "runs", "published_values", "measurements", "summaries", "assessments", "gaps", "reviews", "publications"] as const;
export type RecordKind = typeof RECORD_KINDS[number];
export type ResearchSnapshot = { study: ResearchStudy; access: "owner-draft" | "published-snapshot"; records: Record<RecordKind, ResearchRecord[]>; coverage: Record<RecordKind, number> };
export function researchApiBase(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const url = new URL(value.trim());
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) throw new Error("The research API origin must be HTTPS, or loopback HTTP for local verification, without credentials or query parameters.");
  return url.href.replace(/\/+$/, "");
}
export function recordText(record: ResearchRecord, field: string, missing = "Not recorded") {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : missing;
}
export function valueLabel(value: unknown): string {
  if (value === null || value === undefined) return "missing";
  if (typeof value !== "number" && typeof value !== "string") return "invalid";
  if (typeof value === "string" && (!value.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))) return "invalid";
  return Number.isFinite(Number(value)) ? String(value) : "invalid";
}
export function latestByClaim(rows: ResearchRecord[]) {
  const latest = new Map<string, ResearchRecord>();
  for (const row of rows) {
    if (typeof row.claim_id !== "string") continue;
    const prior = latest.get(row.claim_id);
    const timestamp = Date.parse(row.created_at);
    if (!Number.isFinite(timestamp)) throw new Error("Invalid assessment or gap timestamp; current status is ambiguous.");
    const priorTimestamp = prior ? Date.parse(prior.created_at) : -Infinity;
    if (!prior || timestamp > priorTimestamp || (timestamp === priorTimestamp && row.id > prior.id)) latest.set(row.claim_id, row);
  }
  return latest;
}
export function claimCounts(snapshot: ResearchSnapshot) {
  const latest = latestByClaim(snapshot.records.assessments);
  const counts: Record<ClaimLabel, number> = { reproduced: 0, discrepant: 0, inconclusive: 0, untested: 0 };
  for (const claim of snapshot.records.claims) {
    const label = latest.get(claim.id)?.label ?? "untested";
    if (typeof label !== "string" || !Object.hasOwn(CLAIM_LABELS, label)) throw new Error("Invalid claim assessment; coverage cannot be inferred.");
    counts[label as ClaimLabel] += 1;
  }
  return counts;
}
export function validateSnapshot(value: unknown): ResearchSnapshot {
  if (!value || typeof value !== "object") throw new Error("Research response is missing.");
  const snapshot = value as ResearchSnapshot;
  if (!snapshot.study?.id || !snapshot.records || !snapshot.coverage || !["published-snapshot", "owner-draft"].includes(snapshot.access)) throw new Error("Research response is incomplete.");
  for (const name of RECORD_KINDS) {
    const rows = snapshot.records[name];
    if (!Array.isArray(rows) || snapshot.coverage[name] !== rows.length || new Set(rows.map(row => row.id)).size !== rows.length || rows.some(row => row.study_id !== snapshot.study.id)) throw new Error(`Incomplete or ambiguous research ${name} coverage.`);
  }
  claimCounts(snapshot);
  return snapshot;
}
function csvCell(value: unknown, numeric = false) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Preserve numerical zero/negatives; neutralize formulas in source text fields.
  if (!(numeric && valueLabel(value) !== "invalid") && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function measurementsCsv(snapshot: ResearchSnapshot) {
  const fields = ["run_id", "observation_id", "configuration_identity", "metric", "units", "status", "value", "reason"];
  return fields.join(",") + "\n" + snapshot.records.measurements.map(row => fields.map(field => csvCell(row[field], field === "value")).join(",")).join("\n") + "\n";
}
export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; } catch { return null; }
}
