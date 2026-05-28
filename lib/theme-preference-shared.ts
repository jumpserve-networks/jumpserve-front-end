export type ThemePreference = "light" | "dark" | "system";

export const THEME_PREFERENCE_COOKIE_NAME = "theme-preference";
export const THEME_PREFERENCE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const STORAGE_KEY = THEME_PREFERENCE_COOKIE_NAME;
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function parsePreference(
  value: string | null | undefined,
): ThemePreference | null {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : null;
}
