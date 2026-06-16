import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeNextPath } from "@/lib/auth-redirect";
import { isGoogleAuthenticatedUser } from "@/lib/auth-provider";

const PUBLIC_PATHS = new Set(["/login", "/auth/callback"]);
const AUTH_ERROR_PARAMS = ["error", "error_code", "error_description"];

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

function copyCookies(source: NextResponse, destination: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    destination.cookies.set(cookie);
  });

  return destination;
}

export async function updateSession(request: NextRequest) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthenticated = isGoogleAuthenticatedUser(user);
  const isPublicPath = PUBLIC_PATHS.has(pathname);

  if (
    isAuthenticated &&
    AUTH_ERROR_PARAMS.some((param) => request.nextUrl.searchParams.has(param))
  ) {
    const destination = request.nextUrl.clone();

    AUTH_ERROR_PARAMS.forEach((param) => {
      destination.searchParams.delete(param);
    });

    return copyCookies(response, NextResponse.redirect(destination));
  }

  if (!isAuthenticated && !isPublicPath) {
    if (pathname.startsWith("/api/")) {
      return copyCookies(
        response,
        NextResponse.json({ error: "Authentication required." }, { status: 401 }),
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );

    return copyCookies(response, NextResponse.redirect(loginUrl));
  }

  if (isAuthenticated && pathname === "/login") {
    const destination = request.nextUrl.clone();
    const nextPath = getSafeNextPath(request.nextUrl.searchParams.get("next"));
    const [nextPathname, nextSearch = ""] = nextPath.split("?", 2);

    destination.pathname = nextPathname;
    destination.search = nextSearch ? `?${nextSearch}` : "";

    return copyCookies(response, NextResponse.redirect(destination));
  }

  return response;
}
