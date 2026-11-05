"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { GlobalAuthButton } from "@/app/components/auth-button";
import { JumpServeLogo } from "@/app/components/jumpserve-logo";
import { ThemeSelector } from "@/app/components/theme-selector";
import { ScrollText } from "lucide-react";
import { PROMPTS_PATH } from "@/lib/prompts";

export function SiteHeader({ navigation }: { navigation?: ReactNode }) {
  return (
    <header data-slot="site-header" className="sticky top-0 z-40 h-[var(--site-header-height)] border-b border-border bg-card text-card-foreground">
      <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {navigation}
          <Link
            href="/"
            aria-label="JumpServe home"
            className="inline-flex min-w-0 items-center gap-2 rounded-md text-lg font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card dark:text-primary"
          >
            <JumpServeLogo />
            <span className="hidden truncate sm:inline">JumpServe</span>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link href={PROMPTS_PATH} aria-label="Prompts" title="Prompts" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><ScrollText className="size-4" /><span className="hidden lg:inline">Prompts</span></Link>
          <ThemeSelector variant="icons" />
          <GlobalAuthButton placement="header" />
        </div>
      </div>
    </header>
  );
}
