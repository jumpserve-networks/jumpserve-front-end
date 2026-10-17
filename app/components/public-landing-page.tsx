import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/app/components/ui/card";
import { getSafeNextPath } from "@/lib/auth-redirect";
import { getTestModuleForPath, RESEARCH_IDEAS_MODULE_PATH, RESEARCH_WORKFLOW_MODULE_PATH } from "@/lib/test-modules";
import { cn } from "@/lib/utils";

const PATHWAYS = [
  {
    title: "Verify Existing Claims",
    accent: "border-home-paper-border border-t-home-paper bg-home-paper-surface hover:border-home-paper focus-within:border-home-paper [&_h2]:text-home-paper",
    buttonAccent: "bg-home-paper hover:bg-home-paper/90 focus-visible:ring-home-paper dark:bg-primary dark:hover:bg-primary/90 dark:focus-visible:ring-ring/50",
    description: "Start with an academic paper. Identify its claims, plan checks and compare the results with the published evidence.",
    href: `${RESEARCH_WORKFLOW_MODULE_PATH}/new-study`,
    action: "Start verification",
    previousHref: `${RESEARCH_WORKFLOW_MODULE_PATH}/test-results`,
  },
  {
    title: "Develop a New Idea",
    accent: "border-home-idea-border border-t-home-idea bg-home-idea-surface hover:border-home-idea focus-within:border-home-idea [&_h2]:text-home-idea",
    buttonAccent: "bg-home-idea hover:bg-home-idea/90 focus-visible:ring-home-idea dark:bg-primary dark:hover:bg-primary/90 dark:focus-visible:ring-ring/50",
    description: "Start with a question or unpublished hypothesis. Work with the AI guide to shape a research plan and define how to test it.",
    href: `${RESEARCH_IDEAS_MODULE_PATH}/new-idea`,
    action: "Start developing",
  },
];

export function PublicLandingPage({ nextPath }: { nextPath?: string } = {}) {
  const safeNextPath = getSafeNextPath(nextPath ?? null);
  const requestedModule = getTestModuleForPath(safeNextPath);

  return (
    <main className="relative isolate min-h-[var(--page-height)] bg-background px-5 py-10 sm:px-10 sm:py-14">
      <svg aria-hidden="true" focusable="false" viewBox="0 0 800 320" fill="none" className="pointer-events-none absolute top-0 right-0 -z-10 h-80 w-full max-w-3xl text-home-paper opacity-[0.10] dark:text-primary dark:opacity-[0.18]">
        <g stroke="currentColor" strokeWidth="1" opacity="0.45">
          <path d="M280 0v52a24 24 0 0 0 24 24h304a24 24 0 0 1 24 24v104a24 24 0 0 0 24 24h144" />
          <path className="text-home-idea dark:text-primary" d="M440 0v28a16 16 0 0 0 16 16h264a24 24 0 0 1 24 24v80a24 24 0 0 0 24 24h32" />
          <circle cx="440" cy="44" r="4" />
          <circle cx="632" cy="156" r="4" />
          <circle cx="744" cy="108" r="4" />
        </g>
        <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 126">
          <path className="homepage-signal-flow" d="M280 0v52a24 24 0 0 0 24 24h304a24 24 0 0 1 24 24v104a24 24 0 0 0 24 24h144" />
          <path className="homepage-signal-flow homepage-signal-flow-alternate text-home-idea dark:text-primary" d="M440 0v28a16 16 0 0 0 16 16h264a24 24 0 0 1 24 24v80a24 24 0 0 0 24 24h32" />
        </g>
      </svg>
      <div className="mx-auto max-w-5xl space-y-10 sm:space-y-12">
        <section aria-labelledby="overview-title">
          <h1 id="overview-title" className="mt-2 text-3xl leading-tight font-semibold tracking-tight text-home-paper sm:text-4xl dark:text-foreground">
            Choose your research path.
          </h1>
        </section>

        {requestedModule ? (
          <aside aria-label="Requested page" className="flex flex-col items-start gap-3 rounded-md border border-border bg-accent px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-accent-foreground">Your requested page is in {requestedModule.name}.</p>
            <Button variant="outline" nativeButton={false} render={<Link href={safeNextPath} />}>
              Continue to requested page<ArrowRight aria-hidden="true" />
            </Button>
          </aside>
        ) : null}

        <section aria-label="Research pathways" className="grid gap-4 md:grid-cols-2">
          {PATHWAYS.map((pathway) => (
            <Card key={pathway.title} className={cn("gap-4 transition-[translate,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:shadow-md focus-within:-translate-y-1 focus-within:shadow-md", pathway.accent)}>
              <CardHeader><h2 className="text-xl font-semibold">{pathway.title}</h2></CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm leading-6 text-muted-foreground">{pathway.description}</p>
              </CardContent>
              <CardFooter className="flex-wrap gap-x-4 gap-y-3">
                <Button size="lg" className={cn("group/action h-12 text-base duration-200 active:scale-[0.98]", pathway.buttonAccent, !pathway.previousHref && "w-full sm:w-auto")} nativeButton={false} render={<Link href={pathway.href} />}>
                  {pathway.action}<ArrowRight aria-hidden="true" className="transition-transform duration-200 group-hover/action:translate-x-1 group-focus-visible/action:translate-x-1" />
                </Button>
                {pathway.previousHref ? (
                  <Link href={pathway.previousHref} className="text-sm font-medium whitespace-nowrap text-home-paper underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-home-paper dark:text-muted-foreground">
                    View previous
                  </Link>
                ) : null}
              </CardFooter>
            </Card>
          ))}
        </section>

      </div>
    </main>
  );
}
