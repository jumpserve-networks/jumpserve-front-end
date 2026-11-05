import "server-only";
import { createClient } from "@/lib/supabase/server";

// Page guards verify the Google user; the backend independently verifies this
// forwarded access token. Session metadata itself is never authorization.
export async function promptSessionToken() {
  const client = await createClient();
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session?.access_token) throw new Error("Sign in again to view prompts.");
  return session.access_token;
}
