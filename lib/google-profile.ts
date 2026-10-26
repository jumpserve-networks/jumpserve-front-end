import type { User } from "@supabase/supabase-js";
import { isGoogleAuthenticatedUser } from "@/lib/auth-provider";

type GoogleNames = { first_name: string; last_name: string };

function optionalName(value: unknown): string {
  return typeof value === "string" && [...value].length <= 100 && !/\p{Cc}/u.test(value)
    ? value.trim()
    : "";
}

function googleIdentity(user: User) {
  return user.identities?.find(identity => identity.provider === "google")?.identity_data;
}

export function googleAccountNames(user: User): GoogleNames {
  if (!isGoogleAuthenticatedUser(user)) return { first_name: "", last_name: "" };
  const identity = googleIdentity(user);
  return {
    first_name: optionalName(identity?.given_name) || optionalName(user.user_metadata.given_name),
    last_name: optionalName(identity?.family_name) || optionalName(user.user_metadata.family_name),
  };
}

// Used only on the server after a successful OAuth code exchange. Supabase's
// Google adapter can retain only name/full_name, so ask Google for its explicit
// name components rather than guessing how a display name should be split.
export async function readGoogleAccountNames(user: User, providerToken?: string | null): Promise<GoogleNames> {
  const names = googleAccountNames(user);
  if (!isGoogleAuthenticatedUser(user) || !providerToken || (names.first_name && names.last_name)) return names;
  const subject = googleIdentity(user)?.sub ?? (user.app_metadata.provider === "google" ? user.user_metadata.sub : null);
  if (typeof subject !== "string" || !subject) return names;

  try {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${providerToken}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return names;
    const info: unknown = await response.json();
    if (!info || typeof info !== "object" || Array.isArray(info)) return names;
    const fields = info as Record<string, unknown>;
    if (fields.sub !== subject) return names;
    return {
      first_name: optionalName(fields.given_name) || names.first_name,
      last_name: optionalName(fields.family_name) || names.last_name,
    };
  } catch {
    // Names are optional. A Google timeout or malformed response must not prevent
    // sign-in, and provider tokens/responses must never enter error logs.
    return names;
  }
}
