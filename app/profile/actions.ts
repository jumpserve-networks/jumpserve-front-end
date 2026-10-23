"use server";

import { createClient } from "@/lib/supabase/server";
import { isGoogleAuthenticatedUser } from "@/lib/auth-provider";
import { writeOwnProfile } from "@/lib/profile-store";
import type { Profile } from "@/lib/profile";

export async function saveProfile(input: unknown): Promise<{ profile: Profile; error?: never } | { error: string; profile?: never }> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!isGoogleAuthenticatedUser(user) || !user) return { error: "Your session has expired. Sign in again to save your profile." };
  try {
    return { profile: await writeOwnProfile(client, user, input) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Profile could not be saved." };
  }
}
