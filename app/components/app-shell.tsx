"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SiteHeader } from "@/app/components/site-header";
import { MobileModuleNavigation, ModuleNavigation } from "@/app/components/module-navigation";
import { getTestModuleForPath } from "@/lib/test-modules";
import { subscribeToThemePreference } from "@/lib/theme-preference";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const testModule = getTestModuleForPath(pathname);

  // Keep system and cross-tab theme updates active on pages without a sidebar.
  useEffect(() => subscribeToThemePreference(() => {}), []);

  return <>
    <a href="#page-content" className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
    <SiteHeader navigation={testModule ? <MobileModuleNavigation key={pathname} testModule={testModule} pathname={pathname} /> : undefined} />
    <div className={cn(testModule && "flex min-h-[var(--page-height)] lg:pl-64 print:pl-0")} data-slot="app-layout">
      {testModule && <aside aria-label="Module menu" data-slot="module-sidebar" className="fixed top-[var(--site-header-height)] left-0 z-30 hidden h-[var(--page-height)] w-64 overflow-y-auto overscroll-contain border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block print:hidden">
        <ModuleNavigation testModule={testModule} pathname={pathname} />
      </aside>}
      <div id="page-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">{children}</div>
    </div>
  </>;
}
