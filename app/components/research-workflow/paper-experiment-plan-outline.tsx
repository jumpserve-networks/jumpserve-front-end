"use client";
import { useId, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { planningSources, type ExperimentPlan, type ExperimentStep } from "@/lib/paper-experiment-plan";
import type { PaperBreakdown } from "@/lib/research-paper-breakdown";
import { PaperClaimCriterion } from "./paper-evidence";

type Source = ReturnType<typeof planningSources>["access"][number];

function PlanAction({ step, number, sources, nested, renderCommands }: { step: ExperimentStep; number: string; sources: Map<string, Source>; nested: boolean; renderCommands?: (number: string) => ReactNode }) {
  const Heading = nested ? "h5" : "h4";
  const claim = step.validation_ref ? sources.get(step.validation_ref) : undefined;
  return <li className="space-y-2 text-sm [overflow-wrap:anywhere]">
    <Heading className="flex min-w-0 flex-1 items-baseline gap-2 font-medium">
      <span className="shrink-0 tabular-nums text-muted-foreground">{number}</span>
      <span>{step.title}{step.basis === "proposed" ? " · Proposed implementation" : ""}</span>
    </Heading>
    <p className="whitespace-pre-wrap">{step.instructions}</p>
    {renderCommands?.(number)}
    {claim?.criterion ? <div className="space-y-1">
      <p className="font-medium">Validation check: {claim.label ?? step.validation_ref}</p>
      <PaperClaimCriterion criterion={claim.criterion} />
    </div> : null}
    {step.source_refs.length ? <details>
      <summary className="cursor-pointer text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2">Confirmed supporting details</summary>
      <ul className="mt-2 space-y-3 pl-3">{step.source_refs.map(ref => {
        const source = sources.get(ref)!;
        return <li key={ref} className="space-y-1">
          <p>{source.description}</p>
          {(source.citations ?? [{ quote: source.quote, page: source.page }]).map((citation, index) => <div key={index}>
            <p className="text-xs text-muted-foreground">PDF page {citation.page}</p>
            <blockquote className="mt-1 whitespace-pre-wrap pl-3">{citation.quote}</blockquote>
          </div>)}
        </li>;
      })}</ul>
    </details> : null}
  </li>;
}

export function PaperExperimentPlanOutline({ plan, breakdown, experimentIndex, renderCommands, beforeActions, afterActions }: { plan: ExperimentPlan; breakdown: PaperBreakdown; experimentIndex?: number; renderCommands?: (number: string) => ReactNode; beforeActions?: ReactNode; afterActions?: ReactNode }) {
  const id = useId();
  const sources = new Map(Object.values(planningSources(breakdown)).flat().map(source => [source.ref, source]));
  return <ol role="list" aria-label="Experiments" className="space-y-8">
    {plan.experiments.map((experiment, index) => {
      if (experimentIndex !== undefined && experimentIndex !== index + 1) return null;
      const number = index + 1;
      const body = <>
        {experiment.stages ? <ol role="list" aria-label={`Stages for experiment ${number}`} className="space-y-5 pl-3 sm:pl-5">
          {experiment.stages.map((stage, stageIndex) => <li key={stageIndex}>
            <details open className="group/stage">
              <summary className="cursor-pointer list-none [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden"><h4 className="inline font-medium"><span className="mr-2 tabular-nums text-muted-foreground">{number}.{stageIndex + 1}</span>{stage.title}<ChevronRight aria-hidden="true" className="ml-2 inline size-3 transition-transform group-open/stage:rotate-90" /></h4></summary>
              <ol role="list" aria-label={`Actions for ${number}.${stageIndex + 1} ${stage.title}`} className="mt-4 space-y-5 pl-4 sm:pl-6">{stage.steps.map((step, actionIndex) => <PlanAction key={actionIndex} step={step} number={`${number}.${stageIndex + 1}.${actionIndex + 1}`} sources={sources} nested renderCommands={renderCommands} />)}</ol>
            </details>
          </li>)}
        </ol> : <ol role="list" aria-label={`Steps for experiment ${number}`} className="space-y-5 pl-3 sm:pl-5">{experiment.steps.map((step, actionIndex) => <PlanAction key={actionIndex} step={step} number={`${number}.${actionIndex + 1}`} sources={sources} nested={false} renderCommands={renderCommands} />)}</ol>}
        {experiment.open_questions.length ? <div className="space-y-2 text-sm"><h4 className="font-medium">Decisions to resolve before execution</h4><ul className="list-disc space-y-1 pl-5">{experiment.open_questions.map((question, questionIndex) => <li key={questionIndex}>{question}</li>)}</ul></div> : null}
      </>;
      return <li key={experiment.experiment_refs.join("|")}>
        <section aria-labelledby={`${id}-experiment-${index}`} className="space-y-5">
          <h3 id={`${id}-experiment-${index}`} className="font-semibold [overflow-wrap:anywhere]">{number}. {experiment.title}</h3>
          {beforeActions}{body}{afterActions}
        </section>
      </li>;
    })}
  </ol>;
}
