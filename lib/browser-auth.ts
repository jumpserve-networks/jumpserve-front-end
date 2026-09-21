import { createClient } from "@/lib/supabase/client";

/** The API verifies this token with Supabase before executing an action. */
export async function requireAccessToken() {
  const { data: { session } } = await createClient().auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to run tests or chat with the AI.");
  return session.access_token;
}
