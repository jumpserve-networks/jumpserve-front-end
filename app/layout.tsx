import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthButton } from "@/app/components/auth-button";
import { ThemeToggle } from "@/app/components/theme-toggle";
import {
  DARK_MEDIA_QUERY,
  STORAGE_KEY,
  THEME_PREFERENCE_COOKIE_MAX_AGE_SECONDS,
  THEME_PREFERENCE_COOKIE_NAME,
} from "@/lib/theme-preference-shared";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Jumpserve",
    template: "%s | Jumpserve",
  },
  description: "Explore Jumpserve emulation runs, inspect individual traces, and compare aggregate graph patterns.",
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
        {children}
        <AuthButton />
        <ThemeToggle />
      </body>
    </html>
  );
}
