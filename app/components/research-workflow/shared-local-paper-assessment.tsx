"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { EXPERIMENT_SETUP_TITLE } from "@/lib/paper-assessment-wizard";
import { paperDetailTree } from "@/lib/paper-detail-dependencies";
import { PAPER_BREAKDOWN_SECTIONS } from "@/lib/research-paper-breakdown";
import { researchAssessmentPath } from "@/lib/research-pathways";
import type { SharedLocalPaperAssessment, SharedTerminalBlock } from "@/lib/shared-local-paper-assessment";
import { PaperClaimCriterion } from "./paper-evidence";
import { PaperDetailOutline } from "./paper-detail-outline";
import { CommandBlock, TerminalInputs } from "./paper-terminal-commands";
import { SHARED_TERMINAL_LAYOUT } from "@/lib/paper-terminal-commands";

const steps = [{ id: "breakdown", label: "Step 2 · Paper Breakdown" }, { id: "implementation", label: "Step 3 · Experiment Steps" }, { id: "execution", label: `Step 4 · ${EXPERIMENT_SETUP_TITLE}` }] as const;
function SharedCommand({ block, label, study, index, initiallyOpen = false }: { block: SharedTerminalBlock; label: string; study: string; index: number; initiallyOpen?: boolean }) {
  return block.redacted_preview !== undefined ? <details open={initiallyOpen} className="space-y-2 text-sm">
    <summary className="cursor-pointer text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2">Shared command text · {label}</summary>
    <p className="text-xs text-muted-foreground">{block.notes} This preview is for review; copyable original commands remain with the owner.</p>
    <pre tabIndex={0} aria-label={`Commands for ${label}`} className="max-h-96 overflow-auto bg-muted/40 p-3 font-mono text-xs whitespace-pre [overflow-wrap:normal]"><code>{block.redacted_preview}</code></pre>
  </details> : <CommandBlock block={block} label={label} study={study} index={index} layout={SHARED_TERMINAL_LAYOUT} initiallyOpen={initiallyOpen} />;
}
export function SharedLocalPaperAssessment({ value }: { value: SharedLocalPaperAssessment }) {
  const params = useSearchParams(), requested = params.get("step"), current = steps.find(s => s.id === requested)?.id ?? "breakdown";
  return <section aria-label="Shared local assessment" className="space-y-6">
    <div className="space-y-2 border-y py-4 text-sm">
      <p className="font-medium">Prepared with local Codex · Read-only assessment</p>
      <p>Paper breakdown, experiment plans and commands are available for review. No networking experiments were run, and these outputs have not passed the API workflow’s independent review or Linux sandbox checks.</p>
      <p className="text-muted-foreground">{value.projection.note}{value.projection.redacted ? ` ${value.projection.redacted} additional text redactions.` : ""}</p>
    </div>
    <nav aria-label="Shared assessment steps" className="flex flex-wrap gap-3 border-b pb-4">
      {steps.map(step => <Link key={step.id} href={`${researchAssessmentPath(value.study_id)}?step=${step.id}`} scroll={false} aria-current={current === step.id ? "step" : undefined} className="rounded-md border px-3 py-2 text-sm aria-[current=step]:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2">{step.label}</Link>)}
    </nav>
    {current === "breakdown" ? <div className="space-y-6">
      <h2 className="text-lg font-semibold">Paper Breakdown</h2>
      {value.provenance ? <p className="text-sm">{value.provenance.statement}</p> : null}
      {PAPER_BREAKDOWN_SECTIONS.map((section, index) => <section key={section.id} aria-labelledby={`shared-${section.id}`} className="space-y-3">
        <h3 id={`shared-${section.id}`} className="font-semibold">{index + 1}. {section.title}</h3>
        <PaperDetailOutline nodes={paperDetailTree(value.sections[section.id], String(index + 1))} renderDetail={item => <>
          {item.label ? <h4 className="font-medium">{item.label}</h4> : null}
          {item.kind === "reported_result" ? <p className="text-xs text-muted-foreground">Paper-reported assertion{value.provenance?.classification === "synthetic" ? " · Fabricated value" : ""}</p> : null}
          <p>{item.description}</p>
          {item.specification ? <dl className="space-y-2">{Object.entries(item.specification).map(([key, text]) => <div key={key}><dt className="font-medium capitalize">{key}</dt><dd>{text}</dd></div>)}</dl> : null}
          {item.criterion ? <PaperClaimCriterion criterion={item.criterion} /> : null}
          <p className="text-xs text-muted-foreground">Source PDF {item.pages.length === 1 ? "page" : "pages"} {item.pages.join(", ")}. Source quotations are omitted from this shared copy.</p>
        </>} />
      </section>)}
      {value.implementation_choices.length ? <section className="space-y-3"><h3 className="font-semibold">Implementation choices</h3><ul className="space-y-3 text-sm">{value.implementation_choices.map(choice => <li key={choice.name}><p className="font-medium">{choice.name}</p><p>{choice.reason}</p></li>)}</ul></section> : null}
      <p className="text-sm text-muted-foreground">{value.limitation}</p>
    </div> : <div className="space-y-8">
      <h2 className="text-lg font-semibold">{current === "execution" ? EXPERIMENT_SETUP_TITLE : "Experiment Steps"}</h2>
      {value.plan.experiments.map((experiment, i) => {
        const index = i + 1, scripts = value.scripts[i];
        const stages = experiment.stages ?? [{ title: "Steps", steps: experiment.steps }];
        return <section key={i} className="space-y-5 [overflow-wrap:anywhere]">
          <h3 className="font-semibold">{index}. {experiment.title}</h3>
          {current === "execution" ? <>
            {scripts.inputs.length ? <TerminalInputs inputs={scripts.inputs} /> : null}
            <h4 className="font-medium">Shared setup script</h4>
            <SharedCommand block={scripts.setup} label="shared setup" study={value.study_id} index={index} initiallyOpen />
          </> : null}
          {stages.map((stage, s) => <section key={s} className="space-y-4 pl-3 sm:pl-5">
            <h4 className="font-medium">{index}.{s + 1} {stage.title}</h4>
            <ol className="space-y-5 pl-3 text-sm">{stage.steps.map((action, a) => {
              const ref = experiment.stages ? `${index}.${s + 1}.${a + 1}` : `${index}.${a + 1}`;
              return <li key={ref} className="space-y-2"><h5 className="font-medium">{ref} {action.title}{action.basis === "proposed" ? " · Proposed implementation" : ""}</h5><p>{action.instructions}</p>
                {current === "execution" ? <SharedCommand block={scripts.actions[ref]} label={`step ${ref}`} study={value.study_id} index={index} /> : null}
              </li>;
            })}</ol>
          </section>)}
          {experiment.open_questions.length ? <div className="space-y-2 text-sm"><h4 className="font-medium">Decisions to resolve before execution</h4><ul className="list-disc space-y-2 pl-5">{experiment.open_questions.map((text, n) => <li key={n}>{text}</li>)}</ul></div> : null}
          {current === "execution" ? <SharedCommand block={scripts.cleanup} label="experiment cleanup" study={value.study_id} index={index} /> : null}
        </section>;
      })}
    </div>}
  </section>;
}
