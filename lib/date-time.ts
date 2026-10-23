export type Timestamp = string | number | Date | null | undefined;

export function validTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 100 || /^[+-]/.test(value)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function browserTimeZone(): string {
  return validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? "UTC";
}

/** Numeric inputs are milliseconds. Missing and invalid timestamps never become epoch zero. */
export function timestampDate(value: Timestamp): Date | null {
  if (value === null || value === undefined || value === "") return null;
  // An offset is required: the browser must not reinterpret a recorded wall clock.
  if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatDateTime(value: Timestamp, timeZone: string, dateOnly = false): string {
  const date = timestampDate(value);
  if (!date) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: validTimeZone(timeZone) ?? "UTC",
    year: "numeric", month: "short", day: "numeric",
    ...(!dateOnly ? { hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" } as const : {}),
  }).format(date);
}

/** Calendar-day filtering follows the display zone, including 23/25-hour DST days. */
export function calendarDay(value: Timestamp, timeZone: string): string | null {
  const date = timestampDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: validTimeZone(timeZone) ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
