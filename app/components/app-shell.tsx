"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SiteHeader } from "@/app/components/site-header";
import { MobileModuleNavigation, ModuleNavigation } from "@/app/components/module-navigation";
import { getTestModuleForPath } from "@/lib/test-modules";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const testModule = getTestModuleForPath(pathname);

  return <>
    <a href="#page-content" className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
    <SiteHeader navigation={testModule ? <MobileModuleNavigation key={pathname} testModule={testModule} pathname={pathname} /> : undefined} />
    <div className={cn(testModule && "flex min-h-[var(--page-height)]")} data-slot="app-layout">
      {testModule && <aside aria-label="Module menu" data-slot="module-sidebar" className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block print:hidden">
        <div className="sticky top-[var(--site-header-height)] h-[var(--page-height)] overflow-y-auto overscroll-contain">
          <ModuleNavigation testModule={testModule} pathname={pathname} />
        </div>
      </aside>}
      <div id="page-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">{children}</div>
    </div>
  </>;
}
