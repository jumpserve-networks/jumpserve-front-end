"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/app/components/ui/button";
import { getSafeNextPath } from "@/lib/auth-redirect";
import { isGoogleAuthenticatedUser } from "@/lib/auth-provider";
import { getConfiguredSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type AuthStatus = "loading" | "logged-out" | "logged-in";

type AuthButtonProps = {
  placement?: "floating" | "inline" | "header";
};

export function GlobalAuthButton({ placement = "floating" }: AuthButtonProps) {
  const pathname = usePathname();

  return pathname === "/login" ? null : <AuthButton placement={placement} />;
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.64 12.2c0-.64-.06-1.25-.17-1.84H12v3.48h5.41a4.63 4.63 0 0 1-2.01 3.04v2.52h3.25c1.9-1.75 2.99-4.33 2.99-7.2Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.25-2.52c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.05v2.6A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.41 13.89A5.99 5.99 0 0 1 6.1 12c0-.66.11-1.3.31-1.89V7.5H3.05A10 10 0 0 0 2 12c0 1.61.39 3.13 1.05 4.5l3.36-2.61Z"
        fill="#FBBC04"
      />
      <path
        d="M12 5.98c1.47 0 2.8.51 3.84 1.51l2.88-2.88C16.97 2.98 14.7 2 12 2A10 10 0 0 0 3.05 7.5l3.36 2.61C7.2 7.74 9.4 5.98 12 5.98Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function AuthButton({ placement = "floating" }: AuthButtonProps) {
  const [supabase] = useState(() => createClient());
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const {
        data: { session: nextSession },
      } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setStatus(
        isGoogleAuthenticatedUser(nextSession?.user ?? null)
          ? "logged-in"
          : "logged-out",
      );
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setStatus(
        isGoogleAuthenticatedUser(nextSession?.user ?? null)
          ? "logged-in"
          : "logged-out",
      );
      setErrorMessage(null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleGoogleLogin() {
    setErrorMessage(null);
    setIsSubmitting(true);

    if (typeof window === "undefined") {
      setIsSubmitting(false);
      return;
    }

    const currentUrl = new URL(window.location.href);
    const nextPath =
      currentUrl.pathname === "/login"
        ? getSafeNextPath(currentUrl.searchParams.get("next"))
        : `${currentUrl.pathname}${currentUrl.search}`;
    const callbackOrigin = getConfiguredSiteUrl() ?? currentUrl.origin;
    const callbackUrl = new URL("/auth/callback", callbackOrigin);
    callbackUrl.searchParams.set("next", nextPath);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    setErrorMessage(null);
    setIsSubmitting(true);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    window.location.assign("/login");
  }

  const userLabel =
    session?.user.user_metadata.full_name ||
    session?.user.user_metadata.name ||
    session?.user.email ||
    null;

  return (
    <div
      className={
        placement === "inline"
          ? "flex flex-col items-center gap-2"
          : placement === "header"
          ? "relative flex min-w-0 flex-col items-end gap-2"
          : "fixed top-3 right-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2"
      }
    >
      {status === "logged-in" ? (
        <div className="inline-flex min-w-0 items-center gap-3 text-sm">
          {userLabel ? (
            <span title={userLabel}
            className={cn("max-w-44 truncate text-muted-foreground", placement === "header" && "hidden sm:inline sm:max-w-32")}>
              {userLabel}
            </span>
          ) : (
            <span>Logged in</span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            disabled={isSubmitting}
            className="disabled:cursor-wait"
          >
            {isSubmitting ? "Logging out..." : "Log out"}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleLogin}
          disabled={status === "loading" || isSubmitting}
          className={cn("disabled:cursor-wait", placement === "inline" && "w-full", placement === "header" && "h-8 px-3 text-xs sm:text-sm")}
        >
          <GoogleIcon />
          <span>
            {status === "loading"
              ? "Checking login..."
              : isSubmitting
                ? "Opening Google..."
                : "Login with Google"}
          </span>
        </Button>
      )}

      {errorMessage ? (
        <p className={cn("max-w-sm rounded-lg border border-red-200 bg-red-50/95 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200", placement === "header" && "absolute top-full right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)]")}>
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
