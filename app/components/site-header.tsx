"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { GlobalAuthButton } from "@/app/components/auth-button";
import { JumpServeLogo } from "@/app/components/jumpserve-logo";
import { ThemeToggle } from "@/app/components/theme-toggle";

export function SiteHeader({ navigation }: { navigation?: ReactNode }) {
  return (
    <header data-slot="site-header" className="sticky top-0 z-40 h-[var(--site-header-height)] border-b border-border bg-card text-card-foreground">
      <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {navigation}
          <Link
            href="/"
            aria-label="JumpServe home"
            className="inline-flex shrink-0 items-center gap-2 rounded-md text-lg font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <JumpServeLogo />
            JumpServe
          </Link>
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <GlobalAuthButton placement="header" />
        </div>
      </div>
    </header>
  );
}
