import { NextResponse } from "next/server";
import { getSafeNextPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));
  const providerError = requestUrl.searchParams.get("error_description");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
    }

    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("error", error.message);
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl);
  }

  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set(
    "error",
    providerError ?? "Google sign-in did not return an authorization code.",
  );
  loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
}
