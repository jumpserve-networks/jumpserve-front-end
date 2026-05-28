"use client";

import {
  DARK_MEDIA_QUERY,
  STORAGE_KEY,
  THEME_PREFERENCE_COOKIE_MAX_AGE_SECONDS,
  THEME_PREFERENCE_COOKIE_NAME,
  parsePreference,
  type ThemePreference,
} from "@/lib/theme-preference-shared";

export {
  DARK_MEDIA_QUERY,
  STORAGE_KEY,
  THEME_PREFERENCE_COOKIE_MAX_AGE_SECONDS,
  THEME_PREFERENCE_COOKIE_NAME,
  parsePreference,
  type ThemePreference,
};

type ThemePreferenceListener = () => void;
type ThemePreferenceSnapshot = {
  hasStoredPreference: boolean;
  preference: ThemePreference;
};

const listeners = new Set<ThemePreferenceListener>();
const SERVER_THEME_PREFERENCE_SNAPSHOT: ThemePreferenceSnapshot = {
  hasStoredPreference: false,
  preference: "system",
};
let cachedThemePreferenceSnapshot: ThemePreferenceSnapshot =
  SERVER_THEME_PREFERENCE_SNAPSHOT;

function readCookiePreference(): ThemePreference | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${THEME_PREFERENCE_COOKIE_NAME}=`));

  if (!cookie) {
    return null;
  }

  return parsePreference(decodeURIComponent(cookie.split("=").slice(1).join("=")));
}

function writeCookiePreference(preference: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${THEME_PREFERENCE_COOKIE_NAME}=${encodeURIComponent(
    preference,
  )}; Max-Age=${THEME_PREFERENCE_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

export function readPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const cookiePreference = readCookiePreference();

  if (cookiePreference) {
    return cookiePreference;
  }

  const localStoragePreference = parsePreference(window.localStorage.getItem(STORAGE_KEY));

  if (localStoragePreference) {
    writeCookiePreference(localStoragePreference);
    return localStoragePreference;
  }

  return "system";
}

export function hasStoredPreference() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    readCookiePreference() !== null ||
    parsePreference(window.localStorage.getItem(STORAGE_KEY)) !== null
  );
}

export function resolveDarkMode(preference: ThemePreference) {
  if (typeof window === "undefined") {
    return preference === "dark";
  }

  if (preference === "dark") {
    return true;
  }

  if (preference === "light") {
    return false;
  }

  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

export function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }

  const darkMode = resolveDarkMode(preference);
  document.documentElement.classList.toggle("dark", darkMode);
  document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
}

export function emitThemePreferenceChange() {
  listeners.forEach((listener) => listener());
}

export function subscribeToThemePreference(listener: ThemePreferenceListener) {
  if (typeof window === "undefined") {
    return () => {};
  }

  listeners.add(listener);

  const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
  const handleSystemThemeChange = () => {
    if (readPreference() === "system") {
      applyTheme("system");
      emitThemePreferenceChange();
    }
  };
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      applyTheme(readPreference());
      emitThemePreferenceChange();
    }
  };

  mediaQuery.addEventListener("change", handleSystemThemeChange);
  window.addEventListener("storage", handleStorageChange);

  return () => {
    listeners.delete(listener);
    mediaQuery.removeEventListener("change", handleSystemThemeChange);
    window.removeEventListener("storage", handleStorageChange);
  };
}

export function getThemePreferenceSnapshot(): ThemePreferenceSnapshot {
  const nextSnapshot = {
    hasStoredPreference: hasStoredPreference(),
    preference: readPreference(),
  } satisfies ThemePreferenceSnapshot;

  if (
    cachedThemePreferenceSnapshot.hasStoredPreference ===
      nextSnapshot.hasStoredPreference &&
    cachedThemePreferenceSnapshot.preference === nextSnapshot.preference
  ) {
    return cachedThemePreferenceSnapshot;
  }

  cachedThemePreferenceSnapshot = nextSnapshot;
  return cachedThemePreferenceSnapshot;
}

export function getServerThemePreferenceSnapshot(): ThemePreferenceSnapshot {
  return SERVER_THEME_PREFERENCE_SNAPSHOT;
}

export function setThemePreference(nextPreference: ThemePreference) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, nextPreference);
  writeCookiePreference(nextPreference);
  applyTheme(nextPreference);
  emitThemePreferenceChange();
}
