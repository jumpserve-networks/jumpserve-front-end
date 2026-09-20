"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { GlobalAuthButton } from "@/app/components/auth-button";
import { Button, buttonVariants } from "@/app/components/ui/button";
import { getTestModuleForPath, isModuleSectionActive } from "@/lib/test-modules";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();
  const testModule = getTestModuleForPath(pathname);

  return (
    <header data-slot="site-header" data-module={testModule?.id} className="relative z-40 h-[var(--site-header-height)] border-b border-border bg-card text-card-foreground">
      <div className="mx-auto flex h-full max-w-screen-2xl flex-col justify-center gap-3 px-3 py-3 sm:px-6">
        <div className="flex min-h-10 items-center justify-between gap-3">
          <Link
            href="/"
            aria-label="JumpServe modules"
            className="shrink-0 rounded-md text-lg font-bold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            JumpServe
          </Link>
          <GlobalAuthButton placement="header" />
        </div>

        {testModule ? (
          <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between xl:gap-6">
            <div className="flex min-w-0 items-center justify-between gap-3 xl:flex-1">
              <Link
                href={testModule.href}
                aria-current={pathname === testModule.href ? "page" : undefined}
                className="rounded-md text-sm leading-5 font-semibold text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring sm:text-base"
              >
                {testModule.name}
              </Link>
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/" />} className="shrink-0">
                <LayoutGrid aria-hidden="true" />All modules
              </Button>
            </div>
            <nav aria-label={`${testModule.name} navigation`} className="min-w-0">
              <ul className="grid grid-cols-2 gap-1 sm:flex">
                {testModule.sections.map((section) => {
                  const active = isModuleSectionActive(section, pathname);
                  return (
                    <li key={section.href} className="min-w-0 sm:flex-1 xl:flex-auto">
                      <Link
                        href={section.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          buttonVariants({ variant: active ? "secondary" : "ghost" }),
                          "w-full px-2 text-xs sm:px-3 sm:text-sm",
                          active ? "bg-accent font-semibold text-accent-foreground ring-1 ring-inset ring-primary/30" : "text-muted-foreground",
                        )}
                      >
                        {section.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  );
}
