import { NextResponse } from "next/server";
import { getPostLoginPath, getSafeNextPath } from "@/lib/auth-redirect";
import { getConfiguredSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { initializeGoogleProfile } from "@/lib/profile-store";

const PRODUCTION_SITE_ORIGIN = "https://jumpserve.quaint-lab.org";

function getRedirectOrigin(requestUrl: URL) {
  const configuredSiteUrl = getConfiguredSiteUrl();

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  const isInternalLocalhost =
    requestUrl.hostname === "localhost" ||
    requestUrl.hostname === "127.0.0.1" ||
    requestUrl.hostname === "[::1]";

  if (process.env.NODE_ENV === "production" && isInternalLocalhost) {
    return PRODUCTION_SITE_ORIGIN;
  }

  return requestUrl.origin;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const redirectOrigin = getRedirectOrigin(requestUrl);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));
  const providerError = requestUrl.searchParams.get("error_description");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (data.user) {
        try {
          await initializeGoogleProfile(supabase, data.user, data.session?.provider_token);
        } catch {
          // Authentication has succeeded. A profile outage must not discard the
          // session or the requested destination; the next login can retry.
          console.warn("Google profile initialization unavailable after sign-in.");
        }
      }
      return NextResponse.redirect(new URL(getPostLoginPath(nextPath), redirectOrigin));
    }

    const loginUrl = new URL("/login", redirectOrigin);
    loginUrl.searchParams.set("error", error.message);
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl);
  }

  const loginUrl = new URL("/login", redirectOrigin);
  loginUrl.searchParams.set(
    "error",
    providerError ?? "Google sign-in did not return an authorization code.",
  );
  loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
}
