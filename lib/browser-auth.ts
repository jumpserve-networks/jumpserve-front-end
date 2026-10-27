import { createClient } from "@/lib/supabase/client";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export class SessionCheckError extends Error {
  constructor(cause: unknown) {
    super("Unable to check your sign-in. Check your connection and retry.", { cause });
    this.name = "SessionCheckError";
  }
}

type BrowserAuth = ReturnType<typeof createClient>["auth"];
const pendingReads = new WeakMap<BrowserAuth, Promise<Session | null>>();

/** A failed read is unknown authentication state, not a confirmed sign-out. */
export function readBrowserSession(auth = createClient().auth): Promise<Session | null> {
  let pending = pendingReads.get(auth);
  // The header and profile provider share one SDK session read/refresh at startup.
  if (!pending) {
    pending = (async () => {
      try {
        const { data: { session }, error } = await auth.getSession();
        if (error) throw error;
        return session;
      } catch (error) {
        throw new SessionCheckError(error);
      }
    })();
    pendingReads.set(auth, pending);
    const clear = () => { pendingReads.delete(auth); };
    void pending.then(clear, clear);
  }
  // Bound the UI wait, not the SDK refresh. Preserve its lock/storage handling
  // and keep sharing the in-flight read if the user retries while it is pending.
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new SessionCheckError(new Error("Session check timed out after 15 seconds."))), 15_000);
    void pending.then(
      session => { clearTimeout(timeout); resolve(session); },
      error => { clearTimeout(timeout); reject(error); },
    );
  });
}

export function hasResolvedAuthState(event: AuthChangeEvent, session: Session | null) {
  // Supabase can emit INITIAL_SESSION with null when its session lookup fails.
  // Resolve initial absence with readBrowserSession; explicit sign-out is authoritative.
  return session !== null || event === "SIGNED_OUT";
}

/** The API verifies this token with Supabase before executing an action. */
export async function requireAccessToken(message = "Sign in to run tests or chat with the AI.", expectedUserId?: string) {
  const session = await readBrowserSession();
  if (!session?.access_token) throw new Error(message);
  if (expectedUserId !== undefined && session.user.id !== expectedUserId) throw new Error("Your signed-in account changed. Return to the upload page before uploading another paper.");
  return session.access_token;
}
