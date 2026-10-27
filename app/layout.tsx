import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/app/components/app-shell";
import { UserPreferencesProvider } from "@/app/components/user-preferences";
import { PaperUploadsProvider } from "@/app/components/research-workflow/paper-uploads-provider";
import {
  DARK_MEDIA_QUERY,
  STORAGE_KEY,
  THEME_PREFERENCE_COOKIE_MAX_AGE_SECONDS,
  THEME_PREFERENCE_COOKIE_NAME,
} from "@/lib/theme-preference-shared";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: "Jumpserve",
    template: "%s | Jumpserve",
  },
  description: "Assess academic research paper claims and test unpublished hypotheses with experiments, measurements and reproducible evidence.",
};

const themeInitScript = `
(() => {
  try {
    const storageKey = ${JSON.stringify(STORAGE_KEY)};
    const cookieName = ${JSON.stringify(THEME_PREFERENCE_COOKIE_NAME)};
    const cookieMaxAge = ${JSON.stringify(THEME_PREFERENCE_COOKIE_MAX_AGE_SECONDS)};
    const darkMediaQuery = ${JSON.stringify(DARK_MEDIA_QUERY)};
    const cookiePreference = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(cookieName + "="))
      ?.split("=")
      .slice(1)
      .join("=");
    const decodedCookiePreference = cookiePreference ? decodeURIComponent(cookiePreference) : null;
    const storedPreference = localStorage.getItem(storageKey);
    const hasCookiePreference =
      decodedCookiePreference === "light" || decodedCookiePreference === "dark" || decodedCookiePreference === "system";
    const hasStoredPreference =
      storedPreference === "light" || storedPreference === "dark" || storedPreference === "system";
    const preference =
      hasCookiePreference
        ? decodedCookiePreference
        : hasStoredPreference
          ? storedPreference
          : "system";
    if (!hasCookiePreference && hasStoredPreference) {
      document.cookie = cookieName + "=" + encodeURIComponent(storedPreference) + "; Max-Age=" + cookieMaxAge + "; Path=/; SameSite=Lax";
    }
    if (hasCookiePreference && storedPreference !== preference) {
      localStorage.setItem(storageKey, preference);
    }
    const darkMode =
      preference === "dark" ||
      (preference === "system" && window.matchMedia(darkMediaQuery).matches);
    document.documentElement.classList.toggle("dark", darkMode);
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
  } catch {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <UserPreferencesProvider><PaperUploadsProvider><AppShell>{children}</AppShell></PaperUploadsProvider></UserPreferencesProvider>
      </body>
    </html>
  );
}
