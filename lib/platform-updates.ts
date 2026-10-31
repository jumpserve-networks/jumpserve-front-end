export const PLATFORM_UPDATES_PATH = "/platform-updates";
export const PLATFORM_REPOSITORIES = ["jumpserve-networks/jumpserve-front-end", "jumpserve-networks/jumpserve-back-end", "jumpserve-networks/jumpserve-infra"] as const;
export const PLATFORM_STAGES = ["queued", "investigating", "implementing", "testing", "publishing", "merging", "deploying", "verifying", "reconciling", "completed", "rolled-back", "blocked", "cancelled", "deadline", "budget"] as const;
export type PlatformStage = typeof PLATFORM_STAGES[number];
export type PlatformTask = {
  id: string; title: string; objective: string; repositories: string[]; status: PlatformStage; reason: string;
  max_reserved_cents: number; committed_cents: number; deadline_at: string; cancel_requested: boolean;
  authorization_version: string; created_at: string; updated_at: string;
};
export type PlatformEvent = { sequence: string | number; id: string; task_id: string | null; actor: string; kind: string; message: string; details: Record<string, unknown>; created_at: string };
export type PlatformArtifact = { id: string; task_id: string; name: string; sha256: string; byte_count: number; media_type: string; provenance: Record<string, unknown>; created_at: string };
export type PlatformChange = { id: string; repository: string; base_sha: string; head_sha: string | null; merge_sha: string | null; summary: string; status: string; pr_url: string | null; tree_sha256: string };
export type PlatformRelease = { id: string; component: string; repository: string; revision: string; status: string; external_id: string | null; verification: Record<string, unknown> | null; details: Record<string, unknown>; created_at: string; updated_at: string };
export type PlatformRun = { id: string; number: number; status: string; reconciled: boolean; reason: string | null; reserved_cents: number; usage: Record<string, unknown> | null; request_artifact_id: string; response_artifact_id: string | null; created_at: string; ended_at: string | null };
export type PlatformSnapshot = {
  version: "platform-supervisor-v1"; operator_id: string; operator_role: "owner" | "viewer";
  settings: { paused: boolean; automatic_releases: boolean; worker_status: string; worker_reason: string | null; worker_seen_at: string | null; authorization_version: string | null; revision: number };
  authorization: { version: string; policy_sha256: string; created_at: string } | null;
  tasks: PlatformTask[]; events: PlatformEvent[]; changes: PlatformChange[]; releases: PlatformRelease[]; runs: PlatformRun[]; artifacts: PlatformArtifact[];
  has_more_tasks: boolean; has_more_events: boolean;
  budget_categories?: { category: string; label: string; scope: "assessment" | "platform-task"; max_spend_cents: number; max_model_calls: number; revision: number }[];
};
export type PlatformRead = { status: "available"; data: PlatformSnapshot } | { status: "forbidden" | "unavailable"; reason: string };
export type PlatformAction = "enqueue" | "pause" | "resume" | "enable-releases" | "disable-releases" | "cancel";
export type PlatformControl = { action: PlatformAction; request_id: string; task_id: string | null; payload: Record<string, unknown> };
export function platformId(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected platform object."); return value as Record<string, unknown>; }
export function parsePlatformControl(value: unknown): PlatformControl {
  const input = object(value);
  if (Object.keys(input).some(key => !["action", "request_id", "task_id", "payload"].includes(key)) || !platformId(input.request_id) || (input.task_id !== null && !platformId(input.task_id))) throw new Error("Invalid platform control identity.");
  const actions: string[] = ["enqueue", "pause", "resume", "enable-releases", "disable-releases", "cancel"];
  if (typeof input.action !== "string" || !actions.includes(input.action)) throw new Error("Unsupported platform control.");
  const payload = object(input.payload);
  if (input.action === "enqueue") {
    if (!input.task_id || Object.keys(payload).some(key => !["title", "objective", "repositories", "max_reserved_cents", "elapsed_seconds"].includes(key))) throw new Error("Unexpected task fields.");
    for (const [key, maximum] of [["title", 160], ["objective", 12000]] as const) if (typeof payload[key] !== "string" || !payload[key].trim() || payload[key].length > maximum) throw new Error(`Enter a valid ${key}.`);
    const repositories = payload.repositories;
    if (!Array.isArray(repositories) || !repositories.length || repositories.length > 3 || new Set(repositories).size !== repositories.length || repositories.some(repo => !PLATFORM_REPOSITORIES.includes(repo))) throw new Error("Select the affected JumpServe repositories.");
    if (payload.max_reserved_cents !== undefined && !budgetLimit(payload.max_reserved_cents)) throw new Error("Invalid task budget.");
    if (payload.elapsed_seconds !== undefined && (!Number.isSafeInteger(payload.elapsed_seconds) || (payload.elapsed_seconds as number) < 300 || (payload.elapsed_seconds as number) > 604800)) throw new Error("Invalid task elapsed limit.");
  } else if (Object.keys(payload).length || (input.action === "cancel" ? !input.task_id : input.task_id !== null)) throw new Error("Unexpected control fields.");
  return input as unknown as PlatformControl;
}
export function parsePlatformSnapshot(value: unknown): PlatformSnapshot {
  const input = object(value); const settings = object(input.settings);
  if (input.version !== "platform-supervisor-v1" || !platformId(input.operator_id) || !["owner", "viewer"].includes(String(input.operator_role)) || typeof settings.paused !== "boolean" || typeof settings.automatic_releases !== "boolean" || typeof settings.worker_status !== "string") throw new Error("Unrecognized platform status.");
  for (const key of ["tasks", "events", "changes", "releases", "runs", "artifacts"] as const) if (!Array.isArray(input[key])) throw new Error("Incomplete platform records.");
  for (const task of input.tasks as unknown[]) { const t = object(task); if (!platformId(t.id) || !PLATFORM_STAGES.includes(t.status as PlatformStage) || !Number.isSafeInteger(t.committed_cents) || !budgetLimit(t.max_reserved_cents) || (t.committed_cents as number) < 0 || input.budget_categories === undefined && ((t.max_reserved_cents as number) === -1 || (t.committed_cents as number) > (t.max_reserved_cents as number))) throw new Error("Invalid platform task status."); }
  if (input.budget_categories !== undefined) {
    const categories = input.budget_categories;
    const expected = ["research_assessment", "platform_manual", "platform_maintenance", "platform_repair"];
    if (!Array.isArray(categories) || categories.length !== expected.length || new Set(categories.map(b => object(b).category)).size !== expected.length) throw new Error("Incomplete budget categories.");
    for (const row of categories) { const b = object(row); if (!expected.includes(String(b.category)) || typeof b.label !== "string" || !["assessment", "platform-task"].includes(String(b.scope)) || !budgetLimit(b.max_spend_cents) || !budgetLimit(b.max_model_calls) || !Number.isSafeInteger(b.revision) || (b.revision as number) < 1) throw new Error("Invalid category budget."); }
  }
  for (const event of input.events as unknown[]) { const e = object(event); if (!/^[1-9][0-9]{0,18}$/.test(String(e.sequence)) || !platformId(e.id) || typeof e.message !== "string" || typeof e.kind !== "string" || typeof e.actor !== "string") throw new Error("Invalid platform event."); object(e.details); }
  return input as unknown as PlatformSnapshot;
}
export function platformPullRequest(value: string | null): string | undefined {
  if (!value) return undefined;
  try { const u = new URL(value); if (u.protocol === "https:" && u.hostname === "github.com" && PLATFORM_REPOSITORIES.some(repo => new RegExp(`^/${repo}/pull/[1-9][0-9]*$`).test(u.pathname)) && !u.username && !u.password && !u.search && !u.hash) return u.href; } catch { /* Untrusted links are rendered as text only. */ }
}
export function budgetLimit(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= -1 && value <= 2147483647; }
export function platformMoney(cents: number) { if (!budgetLimit(cents)) throw new Error("Invalid monetary value."); return cents === -1 ? "Unlimited" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
export function platformTime(value: string | null) { if (!value) return "Not recorded"; const time = new Date(value); return Number.isFinite(time.valueOf()) ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "medium" }).format(time) + " UTC" : "Unavailable"; }
