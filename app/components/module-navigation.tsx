"use client";

import { EMULATED_MODULE_PATH, REAL_WORLD_MODULE_PATH, isModuleSectionActive, type TestModule } from "@/lib/test-modules";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChartNoAxesCombined, FileChartColumn, FlaskConical, Globe2, LayoutDashboard, Menu, MessageSquare, ScrollText, Search, Wrench, type LucideIcon } from "lucide-react";
import { Button, buttonVariants } from "@/app/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/app/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PLATFORM_UPDATES_PATH } from "@/lib/platform-updates";
import { PROMPTS_PATH } from "@/lib/prompts";

const sectionIcons: Record<string, LucideIcon> = {
  [`${EMULATED_MODULE_PATH}/test-lookup`]: Search,
  [`${EMULATED_MODULE_PATH}/aggregate-graphs`]: ChartNoAxesCombined,
  [`${EMULATED_MODULE_PATH}/benchmarks`]: FlaskConical,
  [`${EMULATED_MODULE_PATH}/chat`]: MessageSquare,
  [`${REAL_WORLD_MODULE_PATH}/run-a-test`]: Globe2,
  [`${REAL_WORLD_MODULE_PATH}/test-results`]: FileChartColumn,
  [`${REAL_WORLD_MODULE_PATH}/chat`]: MessageSquare,
};

type NavigationProps = { testModule?: TestModule; pathname: string; onNavigate?: () => void };
const subscribeToHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

export function ModuleNavigation({ testModule, pathname, onNavigate }: NavigationProps) {
  const name = testModule?.name ?? "JumpServe";
  const overview = testModule?.href ?? "/";
  const links = [
    { href: overview, label: "Overview", active: pathname === overview, Icon: LayoutDashboard },
    ...(testModule?.sections ?? []).map((section) => ({ ...section, active: isModuleSectionActive(section, pathname), Icon: sectionIcons[section.href] ?? LayoutDashboard })),
    { href: PROMPTS_PATH, label: "Prompts", active: pathname === PROMPTS_PATH || pathname.startsWith(`${PROMPTS_PATH}/`), Icon: ScrollText },
    { href: PLATFORM_UPDATES_PATH, label: "Platform Updates", active: pathname === PLATFORM_UPDATES_PATH || pathname.startsWith(`${PLATFORM_UPDATES_PATH}/`), Icon: Wrench },
  ];

  return <div className="flex min-h-full flex-col gap-6 p-4">
    <div className="px-2 pt-2">
      {testModule && testModule.id !== "research-verification" ? <p className="text-xs text-muted-foreground">Test module</p> : null}
      <p className="mt-2 text-sm font-semibold leading-6">{name}</p>
    </div>
    <nav aria-label={`${name} navigation`}>
      <ul className="space-y-1">
        {links.map(({ href, label, active, Icon }) => <li key={href} className={href === PROMPTS_PATH ? "mt-4 border-t border-sidebar-border pt-4" : undefined}>
          <Link href={href} onNavigate={onNavigate} aria-current={active ? "page" : undefined}
            className={cn(buttonVariants({ variant: "ghost" }), "h-auto min-h-10 w-full justify-start gap-3 whitespace-normal px-3 py-2 text-sm",
              active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground hover:bg-sidebar-accent dark:shadow-[inset_2px_0_0_var(--info)]" : "text-muted-foreground hover:text-sidebar-foreground")}>
            <Icon aria-hidden="true" className="size-4 shrink-0" />{label}
          </Link>
        </li>)}
      </ul>
    </nav>
  </div>;
}

export function MobileModuleNavigation({ testModule, pathname }: NavigationProps) {
  const [open, setOpen] = useState(false);
  const hydrated = useSyncExternalStore(subscribeToHydration, getHydratedSnapshot, getServerHydratedSnapshot);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger disabled={!hydrated} render={<Button type="button" variant="outline" size="icon-sm" className="lg:hidden" aria-label={testModule ? "Open module menu" : "Open navigation menu"} />}>
      <Menu aria-hidden="true" />
    </SheetTrigger>
    <SheetContent side="left" className="max-w-[calc(100%-3rem)] gap-0 overflow-y-auto bg-sidebar text-sidebar-foreground data-[side=left]:w-72">
      <SheetHeader className="sr-only">
        <SheetTitle>{testModule?.name ?? "JumpServe"}</SheetTitle>
        <SheetDescription>{testModule ? "Navigate between this module’s sections, prompts and platform updates." : "Navigate JumpServe."}</SheetDescription>
      </SheetHeader>
      <ModuleNavigation testModule={testModule} pathname={pathname} onNavigate={() => setOpen(false)} />
    </SheetContent>
  </Sheet>;
}
