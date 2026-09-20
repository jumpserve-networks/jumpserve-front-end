import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { getPostLoginPath } from "@/lib/auth-redirect";
import { TEST_MODULES } from "@/lib/test-modules";

const WORKFLOW = [
  {
    title: "Configure experiments",
    description: "Set network conditions, client workloads, and congestion control algorithms for emulated benchmarks.",
  },
  {
    title: "Inspect measurements",
    description: "Follow throughput, round-trip time, queueing delay, and congestion windows for individual clients.",
  },
  {
    title: "Compare and interpret",
    description: "Compare results across runs and use the AI assistant to explore questions about the recorded measurements.",
  },
];

export function PublicLandingPage({ nextPath }: { nextPath?: string }) {
  const destination = getPostLoginPath(nextPath ?? null);
  const loginHref = destination === "/"
    ? "/login"
    : `/login?${new URLSearchParams({ next: destination })}`;

  return (
    <main className="min-h-[var(--page-height)] bg-background px-5 py-10 sm:px-10 sm:py-14">
      <div className="mx-auto max-w-5xl space-y-10 sm:space-y-12">
        <section aria-labelledby="overview-title" className="max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">Network research</p>
          <h1 id="overview-title" className="mt-2 text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
            A research platform for network performance.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            JumpServe brings experiment configuration, network measurements, and analysis
            into one workspace. Study how congestion control algorithms behave as
            bandwidth, delay, workloads, and queue sizes change.
          </p>
          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Button nativeButton={false} render={<Link href={loginHref} />}>
              Sign in to JumpServe<ArrowRight aria-hidden="true" />
            </Button>
            <p className="text-sm text-muted-foreground">Choose a test module after signing in.</p>
          </div>
        </section>

        <section aria-labelledby="workflow-title">
          <h2 id="workflow-title" className="text-xl font-semibold tracking-tight text-foreground">
            From experiment to analysis
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {WORKFLOW.map((step) => (
              <Card key={step.title} className="gap-3">
                <CardHeader><h3 className="text-base font-semibold">{step.title}</h3></CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="environments-title">
          <h2 id="environments-title" className="text-xl font-semibold tracking-tight text-foreground">
            Test environments
          </h2>
          <Card className="mt-4 gap-0 divide-y divide-border py-0">
            {TEST_MODULES.map((module) => (
              <div key={module.id} className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8 sm:p-6">
                <div>
                  <h3 className="text-base font-semibold text-foreground">{module.name}</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{module.description}</p>
                </div>
                <p className="text-xs leading-6 font-medium text-muted-foreground">
                  {module.status === "available" ? "Available" : "Coming soon"}
                </p>
              </div>
            ))}
          </Card>
        </section>
      </div>
    </main>
  );
}
