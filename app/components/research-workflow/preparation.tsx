"use client";
import { Button } from "@/app/components/ui/button";
import { preparationSteps, type ResearchSnapshot } from "@/lib/research-workflow";

export function StudyPreparation({ snapshot, showActions = true }: { snapshot: ResearchSnapshot; showActions?: boolean }) {
  const steps = preparationSteps(snapshot);
  const next = steps.find(step => step.count === 0);
  function openEditor(id: string) {
    const editor = document.getElementById(id);
    if (!(editor instanceof HTMLDetailsElement)) return;
    editor.open = true;
    editor.scrollIntoView({ block: "start" });
    editor.querySelector("summary")?.focus({ preventScroll: true });
  }
  return <section aria-label="Assessment preparation" className="space-y-4 rounded-lg border p-5">
    <h2 className="text-lg font-semibold">{next ? "Assessment preparation required" : "Recorded campaign setup"}</h2>
    <p className="text-sm">Use “Prepare paper and queue checks” to preserve an available source-grounded plan and enqueue its campaigns. Other papers need a reviewed domain plan or the manual preparation steps below. Queue execution and scientific review remain separate.</p>
    <ol className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">{steps.map(step => <li key={step.id} className="rounded-md border p-3"><p className="font-medium">{step.label}: {step.count}</p><p className="mt-1 text-xs text-muted-foreground">{step.description}</p></li>)}</ol>
    {next ? <div className="space-y-2"><p className="text-sm font-medium">Next step: {next.action.toLowerCase()}.</p>{showActions ? <Button size="sm" variant="outline" onClick={() => openEditor(next.editor)}>{next.action}</Button> : null}<p className="text-xs text-muted-foreground">Use the “Record to add” selector in the authenticated workspace for source, claim, configuration, campaign and claim-check records.</p></div> : <p className="text-sm">Open “Queue a campaign with prerequisites” below to select a linked campaign and supply the exact inputs. Recorded setup counts do not establish input availability, scientific completeness or execution success.</p>}
  </section>;
}
