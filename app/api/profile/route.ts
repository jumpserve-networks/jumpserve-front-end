import { createClient } from "@/lib/supabase/server";
import { isGoogleAuthenticatedUser } from "@/lib/auth-provider";
import { readOwnProfile } from "@/lib/profile-store";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!isGoogleAuthenticatedUser(user) || !user) return Response.json({ error: "Sign in to view your profile." }, { status: 401, headers });
  try {
    return Response.json({ profile: await readOwnProfile(client, user) }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Profile is unavailable." }, { status: 503, headers });
  }
}
