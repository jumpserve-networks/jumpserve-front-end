import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LandingPageShell } from "@/app/components/landing-page-shell";
import {
  THEME_PREFERENCE_COOKIE_NAME,
  parsePreference,
} from "@/lib/theme-preference-shared";

export const metadata: Metadata = {
  title: "Jumpserve",
  description: "Landing page for Jumpserve's emulation run explorer and aggregate graph tools.",
};

export default async function Home() {
  const cookieStore = await cookies();
  const initialHasStoredThemePreference =
    parsePreference(cookieStore.get(THEME_PREFERENCE_COOKIE_NAME)?.value) !== null;

  return (
    <LandingPageShell
      initialHasStoredThemePreference={initialHasStoredThemePreference}
    />
  );
}
