import Link from "next/link";
import { ArrowRight, FlaskConical, Globe2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/app/components/ui/card";
import { getSafeNextPath } from "@/lib/auth-redirect";
import { getTestModuleForPath, TEST_MODULES } from "@/lib/test-modules";

export function ModuleChooser({ nextPath }: { nextPath?: string }) {
  const safeNextPath = getSafeNextPath(nextPath ?? null);
  const requestedModule = getTestModuleForPath(safeNextPath);

  return (
    <main className="space-atmosphere relative min-h-[var(--page-height)] px-5 py-12 sm:px-10 sm:py-20">
      <div className="relative z-10 mx-auto max-w-5xl">
        <p className="text-sm font-semibold tracking-widest text-primary uppercase">JumpServe modules</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Choose a test module
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/80">
          Select the type of networking tests you want to work with.
          Each module brings together its tests, results, and analysis tools.
        </p>

        {requestedModule ? (
          <p className="mt-6 rounded-xl border border-primary/25 bg-card/90 px-4 py-3 text-sm text-foreground">
            Your requested page is in {requestedModule.name}. Select that module to continue.
          </p>
        ) : null}

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {TEST_MODULES.map((module) => {
            const available = module.status === "available";
            const continueRequestedPage = requestedModule?.id === module.id;
            const Icon = available ? FlaskConical : Globe2;

            return (
              <Card key={module.id} className="gap-5 rounded-2xl bg-card/95 shadow-lg shadow-black/5">
                <CardHeader>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="rounded-xl bg-secondary p-3 text-primary"><Icon className="size-6" aria-hidden="true" /></span>
                    <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                      {available ? "Available" : "Coming soon"}
                    </span>
                  </div>
                  <h2 className="max-w-sm text-2xl leading-snug font-semibold text-foreground">{module.name}</h2>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-sm leading-6 text-muted-foreground">{module.description}</p>
                </CardContent>
                <CardFooter>
                  {available ? (
                    <Button
                      nativeButton={false}
                      render={<Link href={continueRequestedPage ? safeNextPath : module.href} />}
                      className="w-full sm:w-auto"
                    >
                      {continueRequestedPage ? "Continue to requested page" : "Open module"}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  ) : (
                    <Button variant="outline" disabled className="w-full sm:w-auto">Coming soon</Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
        <p className="mt-8 text-sm leading-6 text-foreground/80">
          More test modules, including CDN tests, will be added here as they become available.
        </p>
      </div>
    </main>
  );
}
