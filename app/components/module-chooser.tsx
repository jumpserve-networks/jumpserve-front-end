import Link from "next/link";
import { ArrowRight, FlaskConical, Globe2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { getSafeNextPath } from "@/lib/auth-redirect";
import { getTestModuleForPath, TEST_MODULES } from "@/lib/test-modules";

export function ModuleChooser({ nextPath }: { nextPath?: string }) {
  const safeNextPath = getSafeNextPath(nextPath ?? null);
  const requestedModule = getTestModuleForPath(safeNextPath);

  return (
    <main className="min-h-[var(--page-height)] bg-background px-5 py-10 sm:px-10 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium text-muted-foreground">Network research</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Choose a test module
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Select an experimental environment to access its tests, results, and analysis tools.
        </p>

        {requestedModule ? (
          <p className="mt-6 rounded-md border border-border bg-accent px-4 py-3 text-sm text-accent-foreground">
            Your requested page is in {requestedModule.name}. Select that module to continue.
          </p>
        ) : null}

        <Card className="mt-8 gap-0 divide-y divide-border py-0">
          {TEST_MODULES.map((module) => {
            const available = module.status === "available";
            const continueRequestedPage = requestedModule?.id === module.id;
            const Icon = available ? FlaskConical : Globe2;

            return (
              <section key={module.id} className="grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8">
                <div className="flex items-start gap-4">
                  <Icon className="mt-1 hidden size-5 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
                  <div>
                    <h2 className="text-lg leading-6 font-semibold text-foreground">{module.name}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{module.description}</p>
                    <p className="mt-3 text-xs font-medium text-muted-foreground">{available ? "Available" : "Coming soon"}</p>
                  </div>
                </div>
                <div>
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
                    <Button variant="outline" disabled className="w-full sm:w-auto">Open module<ArrowRight aria-hidden="true" /></Button>
                  )}
                </div>
              </section>
            );
          })}
        </Card>
      </div>
    </main>
  );
}
