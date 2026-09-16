"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlobalAuthButton } from "@/app/components/auth-button";
import { buttonVariants } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/test-lookup", label: "Test Lookup", paths: ["/test-lookup", "/parent-run"] },
  { href: "/aggregate-graphs", label: "Aggregate Graphs", paths: ["/aggregate-graphs"] },
  { href: "/benchmarks", label: "Run Benchmark", paths: ["/benchmarks"] },
  { href: "/chat", label: "Chat with AI", paths: ["/chat"] },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="relative z-40 h-[var(--site-header-height)] border-b border-border bg-card text-card-foreground">
      <div className="mx-auto grid h-full max-w-screen-2xl grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 px-3 py-2 sm:px-6 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Link
          href="/"
          aria-label="JumpServe home"
          className="w-fit rounded-md text-lg font-bold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          JumpServe
        </Link>

        <nav aria-label="Primary" className="col-span-2 row-start-2 min-w-0 xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:justify-self-center">
          <ul className="grid grid-cols-2 gap-1 sm:flex sm:justify-center">
            {SECTIONS.map((section) => {
              const active = section.paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

              return (
                <li key={section.href} className="min-w-0">
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

        <div className="col-start-2 row-start-1 min-w-0 justify-self-end xl:col-start-3">
          <GlobalAuthButton placement="header" />
        </div>
      </div>
    </header>
  );
}
