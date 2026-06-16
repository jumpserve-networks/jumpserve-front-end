import { redirect } from "next/navigation";
import { isGoogleAuthenticatedUser } from "@/lib/auth-provider";
import { createClient } from "@/lib/supabase/server";

export async function requireGoogleUser(nextPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isGoogleAuthenticatedUser(user)) {
    const params = new URLSearchParams({ next: nextPath });
    redirect(`/login?${params.toString()}`);
  }

  return user;
}
