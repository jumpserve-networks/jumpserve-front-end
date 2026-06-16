import type { User } from "@supabase/supabase-js";

const GOOGLE_PROVIDER = "google";

export function isGoogleAuthenticatedUser(user: User | null): user is User {
  if (!user) {
    return false;
  }

  const providers = user.app_metadata.providers;

  return (
    user.app_metadata.provider === GOOGLE_PROVIDER ||
    (Array.isArray(providers) && providers.includes(GOOGLE_PROVIDER)) ||
    user.identities?.some((identity) => identity.provider === GOOGLE_PROVIDER) ===
      true
  );
}
