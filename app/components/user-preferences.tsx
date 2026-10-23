"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { isGoogleAuthenticatedUser } from "@/lib/auth-provider";
import { browserTimeZone, formatDateTime, timestampDate, type Timestamp } from "@/lib/date-time";
import { parseProfile, type Profile } from "@/lib/profile";

type Preferences = { profile: Profile | null; loading: boolean; error: string; refresh: () => void; update: (profile: Profile) => void };
const Context = createContext<Preferences | null>(null);
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => createClient());
  const [state, setState] = useState({ profile: null as Profile | null, loading: true, error: "" });
  const [revision, setRevision] = useState(0);
  const actor = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    let request: AbortController | null = null;
    let generation = 0;
    async function load(id: string | null) {
      request?.abort();
      const current = ++generation;
      actor.current = id;
      if (!id) { if (active) setState({ profile: null, loading: false, error: "" }); return; }
      setState(previous => ({ profile: previous.profile?.id === id ? previous.profile : null, loading: true, error: "" }));
      const controller = request = new AbortController();
      try {
        const response = await fetch("/api/profile", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Profile is unavailable.");
        const profile = parseProfile(data.profile, id);
        if (active && current === generation) setState({ profile, loading: false, error: "" });
      } catch (error) {
        if (active && current === generation && !controller.signal.aborted) setState({ profile: null, loading: false, error: error instanceof Error ? error.message : "Profile is unavailable." });
      }
    }
    void client.auth.getSession().then(({ data: { session } }) => {
      if (active && generation === 0) void load(isGoogleAuthenticatedUser(session?.user ?? null) ? session!.user.id : null);
    }).catch(() => { if (active) void load(null); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      // No awaited Supabase operations inside its auth event lock.
      const id = isGoogleAuthenticatedUser(session?.user ?? null) ? session!.user.id : null;
      if (active && (generation === 0 || id !== actor.current)) void load(id);
    });
    return () => { active = false; generation++; request?.abort(); subscription.unsubscribe(); };
  }, [client, revision]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const update = useCallback((profile: Profile) => {
    if (profile.id === actor.current) setState({ profile, loading: false, error: "" });
  }, []);
  return <Context.Provider value={{ ...state, refresh, update }}>{children}</Context.Provider>;
}

export function useUserPreferences() { return useContext(Context); }

export function useTimeZone(): string | null {
  const preferences = useUserPreferences();
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  return ready && !preferences?.loading ? preferences?.profile?.timezone ?? browserTimeZone() : null;
}

export function useDateTime() {
  const timeZone = useTimeZone();
  return (value: Timestamp, dateOnly = false) => !timestampDate(value) ? "Time unavailable" : timeZone ? formatDateTime(value, timeZone, dateOnly) : "…";
}

export function LocalDateTime({ value, fallback = "Time unavailable", dateOnly = false }: { value: Timestamp; fallback?: string; dateOnly?: boolean }) {
  const timeZone = useTimeZone();
  const date = timestampDate(value);
  return date ? <time dateTime={date.toISOString()} title={timeZone ?? undefined}>{timeZone ? formatDateTime(date, timeZone, dateOnly) : "…"}</time> : <span>{fallback}</span>;
}
