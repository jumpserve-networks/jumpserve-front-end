import type { IdeaPacket, IdeaRun } from "./research-ideas";

type RecordedField = { path: string; present: boolean; state: "missing" | "empty" | "null" | "recorded"; value?: unknown; value_sha256: string | null };
export type ReviewSources = { fields: RecordedField[]; version: number };
function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalized(item)]));
  return value;
}
function canonical(value: unknown) { return JSON.stringify(normalized(value)); }
function lookup(packet: IdeaPacket, path: string) {
  let value: unknown = packet.document;
  if (!path.startsWith("/")) return { present: false };
  for (const key of path.slice(1).split("/")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return { present: false };
    value = (value as Record<string, unknown>)[key];
  }
  return { present: true, value };
}

// Verify against the independently returned packet; never display a mismatched
// value supplied in a review event as if it were the owner's recorded text.
export function reviewSources(run: IdeaRun, packet?: IdeaPacket): ReviewSources | null {
  const events = run.provenance.tool_events;
  if (!Array.isArray(events)) return null;
  const event = events.find(value => value?.name === "submit_idea_issues" && value.executed === false);
  if (!event) return null;
  const source = event.source_evidence;
  if (!packet || packet.id !== run.packet_id || !["idea-review-sources-v1", "idea-review-sources-v2"].includes(source?.version) || source.packet_sha256 !== packet.sha256 || !Array.isArray(source.fields)) throw new Error("Review source evidence does not match the saved plan version.");
  const seen = new Set<string>();
  const fields: RecordedField[] = source.fields.map((row: RecordedField) => {
    if (typeof row.path !== "string" || seen.has(row.path)) throw new Error("Review source references are invalid or duplicated.");
    seen.add(row.path);
    const actual = lookup(packet, row.path);
    const expectedState = !actual.present ? "missing" : actual.value === null ? "null" : canonical(actual.value) === '""' || canonical(actual.value) === "[]" || canonical(actual.value) === "{}" ? "empty" : "recorded";
    if (row.present !== actual.present || row.state !== expectedState || (row.present && (canonical(row.value) !== canonical(actual.value) || typeof row.value_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.value_sha256))) || (!row.present && (Object.hasOwn(row, "value") || row.value_sha256 !== null))) throw new Error("Review source values differ from the original saved plan.");
    return { ...row, ...(actual.present ? { value: actual.value } : {}) };
  });
  return { fields, version: packet.version };
}
