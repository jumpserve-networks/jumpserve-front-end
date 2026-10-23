import { validTimeZone } from "@/lib/date-time";

export type Profile = { id: string; first_name: string; last_name: string; timezone: string | null };
export type ProfileInput = { first_name: string; last_name: string; timezone: string };
export const PROFILE_COLUMNS = "id,first_name,last_name,timezone";

function name(value: unknown, label: string): string {
  if (typeof value !== "string" || [...value].length > 100 || /\p{Cc}/u.test(value)) {
    throw new Error(`${label} must be at most 100 characters and contain no control characters.`);
  }
  return value.trim();
}

export function parseProfileInput(value: unknown): ProfileInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Enter your profile details.");
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).length !== 3 || Object.keys(fields).some(k => !["first_name", "last_name", "timezone"].includes(k))) {
    throw new Error("Only first name, last name and time zone can be updated.");
  }
  const timezone = validTimeZone(fields.timezone);
  if (!timezone) throw new Error("Choose a valid time zone, such as America/New_York.");
  return { first_name: name(fields.first_name, "First name"), last_name: name(fields.last_name, "Last name"), timezone };
}

export function parseProfile(value: unknown, userId: string): Profile {
  if (!value || typeof value !== "object") throw new Error("Profile response is invalid.");
  const p = value as Record<string, unknown>;
  if (Object.keys(p).length !== 4 || p.id !== userId || (p.timezone !== null && !validTimeZone(p.timezone))) {
    throw new Error("Profile response does not match the signed-in user.");
  }
  return { id: userId, first_name: name(p.first_name, "First name"), last_name: name(p.last_name, "Last name"), timezone: p.timezone === null ? null : validTimeZone(p.timezone) };
}
