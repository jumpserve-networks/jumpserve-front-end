import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { PreviousStudyResults } from "@/app/components/previous-study-results";
import { getSafeNextPath } from "@/lib/auth-redirect";
import { getTestModuleForPath, RESEARCH_WORKFLOW_MODULE_PATH } from "@/lib/test-modules";
import { cn } from "@/lib/utils";

const WORKFLOW = [
  {
    title: "Define the claim",
    accent: "dark:border-t-info dark:[&_h3]:text-info",
    description: "Start with a claim from an academic paper or a new, unpublished hypothesis. Specify the conditions and evidence needed to assess it.",
  },
  {
    title: "Plan and run checks",
    accent: "dark:border-t-success dark:[&_h3]:text-success",
    description: "Document the protocol and inputs. Reanalyze existing data, reproduce an experiment, or run a new test, keeping measurements with their configurations.",
  },
  {
    title: "Report the evidence",
    accent: "dark:border-t-highlight dark:[&_h3]:text-highlight",
    description: "Explain what the results support, where they disagree, and what remains uncertain or untested. Preserve the evidence and identify useful follow-up checks.",
  },
];

export function PublicLandingPage({ nextPath }: { nextPath?: string } = {}) {
  const safeNextPath = getSafeNextPath(nextPath ?? null);
  const requestedModule = getTestModuleForPath(safeNextPath);

  return (
    <main className="min-h-[var(--page-height)] bg-background px-5 py-10 sm:px-10 sm:py-14">
      <div className="mx-auto max-w-5xl space-y-10 sm:space-y-12">
        <section aria-labelledby="overview-title">
          <p className="text-sm font-medium text-muted-foreground dark:text-primary">Research claims &amp; experiments</p>
          <h1 id="overview-title" className="mt-2 text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
            Assess research claims. Test new ideas.
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            JumpServe helps you assess claims in academic research papers and test new
            claims that have not been published yet. Plan experiments, collect
            measurements, and report what the evidence supports.
          </p>
          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Button nativeButton={false} render={<Link href={RESEARCH_WORKFLOW_MODULE_PATH} />}>
              Research Verification<ArrowRight aria-hidden="true" />
            </Button>
            <Link href={`${RESEARCH_WORKFLOW_MODULE_PATH}/test-results`} className="text-sm font-medium underline underline-offset-4">
              View published assessments
            </Link>
            <Link href={`${RESEARCH_WORKFLOW_MODULE_PATH}/new-idea`} className="text-sm font-medium underline underline-offset-4">Develop a research idea</Link>
          </div>
        </section>

        {requestedModule ? (
          <aside aria-label="Requested page" className="flex flex-col items-start gap-3 rounded-md border border-border bg-accent px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-accent-foreground">Your requested page is in {requestedModule.name}.</p>
            <Button variant="outline" nativeButton={false} render={<Link href={safeNextPath} />}>
              Continue to requested page<ArrowRight aria-hidden="true" />
            </Button>
          </aside>
        ) : null}

        <section aria-labelledby="workflow-title">
          <h2 id="workflow-title" className="text-xl font-semibold tracking-tight text-foreground">
            From claim to evidence
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {WORKFLOW.map((step) => (
              <Card key={step.title} className={cn("gap-3", step.accent)}>
                <CardHeader><h3 className="text-base font-semibold">{step.title}</h3></CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="previous-results-title">
          <h2 id="previous-results-title" className="text-xl font-semibold tracking-tight text-foreground">
            Previous assessments and test results
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Explore earlier paper assessments and recorded network experiments.
            Reuse their methods and measurements to inform your next research question.
          </p>
          <PreviousStudyResults />
        </section>
      </div>
    </main>
  );
}
