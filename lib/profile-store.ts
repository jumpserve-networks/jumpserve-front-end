import type { SupabaseClient, User } from "@supabase/supabase-js";
import { parseProfile, parseProfileInput, PROFILE_COLUMNS } from "@/lib/profile";

export async function readOwnProfile(client: SupabaseClient, user: User) {
  const { data, error } = await client.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle();
  if (error) throw new Error(`Profile could not be loaded: ${error.message}`);
  return parseProfile(data ?? {
    id: user.id,
    first_name: typeof user.user_metadata.given_name === "string" ? user.user_metadata.given_name : "",
    last_name: typeof user.user_metadata.family_name === "string" ? user.user_metadata.family_name : "",
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
