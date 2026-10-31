export type WorkerHeartbeat = {
  state: "fresh" | "delayed" | "unknown";
  label: "Fresh" | "Delayed" | "Unavailable";
  detail: string;
  ageSeconds: number | null;
};

// Only recorded, timezone-qualified timestamps are evidence. Date.parse alone
// also accepts ambiguous dates and silently normalizes invalid calendar days.
function recordedTime(value: string): number | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;
  const [, year, month, day, hour, minute, second, , zone] = parts;
  const calendar = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (!Number.isFinite(calendar.valueOf()) || calendar.getUTCDate() !== Number(day)
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59
    || (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) return null;
  const time = Date.parse(value.replace(" ", "T"));
  return Number.isFinite(time) ? time : null;
}

export function workerHeartbeat(seenAt: unknown, now: number | null): WorkerHeartbeat {
  const unknown = (detail: string): WorkerHeartbeat => ({ state: "unknown", label: "Unavailable", detail, ageSeconds: null });
  if (seenAt === null || seenAt === undefined || seenAt === "") return unknown("No worker heartbeat recorded.");
  if (typeof seenAt !== "string") return unknown("Invalid recorded heartbeat timestamp.");
  const seen = recordedTime(seenAt);
  if (seen === null) return unknown("Invalid recorded heartbeat timestamp.");
  if (now === null || !Number.isFinite(now)) return unknown("Waiting for the browser clock to assess freshness.");
  const age = now - seen;
  if (age < 0) return unknown("Recorded heartbeat is in the future; check clock alignment.");
  return age <= 90_000
    ? { state: "fresh", label: "Fresh", detail: "Recorded within the last 90 seconds.", ageSeconds: Math.floor(age / 1000) }
    : { state: "delayed", label: "Delayed", detail: "Recorded more than 90 seconds ago.", ageSeconds: Math.floor(age / 1000) };
}
