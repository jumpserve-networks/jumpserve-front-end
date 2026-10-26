import type { SupabaseClient, User } from "@supabase/supabase-js";
import { parseProfile, parseProfileInput, PROFILE_COLUMNS } from "@/lib/profile";
import { isGoogleAuthenticatedUser } from "@/lib/auth-provider";
import { googleAccountNames, readGoogleAccountNames } from "@/lib/google-profile";

export async function initializeGoogleProfile(client: SupabaseClient, user: User, providerToken?: string | null) {
  if (!isGoogleAuthenticatedUser(user)) return;
  const { data, error } = await client.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle();
  if (error) throw new Error("Google profile initialization could not read the profile.");
  if (data) return;

  const names = await readGoogleAccountNames(user, providerToken);
  if (!names.first_name && !names.last_name) return;
  // Insert once. A concurrent profile save or second callback wins the conflict;
  // subsequent sign-ins never overwrite saved names (including empty ones) or
  // the user's preferred time zone. The user's JWT and existing RLS apply.
  const { error: insertError } = await client.from("profiles").upsert(
    { id: user.id, ...names, timezone: null },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (insertError) throw new Error("Google profile initialization could not save the profile.");
}

export async function readOwnProfile(client: SupabaseClient, user: User) {
  const { data, error } = await client.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle();
  if (error) throw new Error(`Profile could not be loaded: ${error.message}`);
  return parseProfile(data ?? {
    id: user.id,
    ...googleAccountNames(user),
    timezone: null,
  }, user.id);
}

export async function writeOwnProfile(client: SupabaseClient, user: User, input: unknown) {
  const fields = parseProfileInput(input);
  // The authenticated identity is never supplied by the form. The user's JWT and
  // profiles RLS independently restrict both the insert and conflict-update path.
  const { data, error } = await client.from("profiles").upsert({ id: user.id, ...fields }, { onConflict: "id" }).select(PROFILE_COLUMNS).single();
  if (error) throw new Error(`Profile could not be saved: ${error.message}`);
  return parseProfile(data, user.id);
}
