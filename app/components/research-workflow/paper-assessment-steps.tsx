"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { PAPER_ASSESSMENT_STEPS, parsePaperAssessmentStep, type PaperAssessmentStep } from "@/lib/paper-assessment-wizard";
import { NEW_ASSESSMENT_PATH } from "@/lib/test-modules";

export type PaperWizardNavigation = { requestedStep?: PaperAssessmentStep; navigate: (step: PaperAssessmentStep) => void };
export function PaperWizardRoute({ children }: { children: (navigation: PaperWizardNavigation) => ReactNode }) {
  const pathname = usePathname(), params = useSearchParams(), router = useRouter();
  function navigate(step: PaperAssessmentStep) {
    const query = new URLSearchParams(params.toString());
    query.set("step", step);
    router.push(`${step === "upload" ? NEW_ASSESSMENT_PATH : pathname}?${query}`, { scroll: false });
  }
  return children({ requestedStep: parsePaperAssessmentStep(params.get("step")), navigate });
}

export function PaperAssessmentSteps({ current = "upload", assessment = false, implementation = false, execution = false, busy = false, onStep }: {
  current?: PaperAssessmentStep; assessment?: boolean; implementation?: boolean; execution?: boolean; busy?: boolean; onStep?: (step: PaperAssessmentStep) => void;
}) {
  return <nav aria-label="Assessment steps" className="border-b pb-4">
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {PAPER_ASSESSMENT_STEPS.map((step, index) => <li key={step.id}>
        <Button nativeButton={step.id !== "upload"} render={step.id === "upload" ? <Link href={NEW_ASSESSMENT_PATH} /> : undefined} variant={current === step.id ? "secondary" : "ghost"} className="h-auto w-full justify-start gap-3 whitespace-normal px-3 py-3 text-left" aria-current={current === step.id ? "step" : undefined}
          disabled={busy || step.id === "breakdown" && !assessment || step.id === "implementation" && !implementation || step.id === "execution" && !execution} onClick={step.id === "upload" ? undefined : () => onStep?.(step.id)}>
          <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span>
          <span><span className="sr-only">Step {index + 1}: </span>{step.title}</span>
        </Button>
      </li>)}
    </ol>
  </nav>;
}
