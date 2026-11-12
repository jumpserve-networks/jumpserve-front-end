"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { requireAccessToken } from "@/lib/browser-auth";
import { RESEARCH_SIGN_IN_REQUIRED } from "@/lib/research-workflow-api";
import { EXPERIMENT_PLAN_PATH, planPending, planningSources, reviewedSections, validateExperimentPlanView, type ExperimentPlanView, type ReviewedSections } from "@/lib/paper-experiment-plan";
import { PAPER_BREAKDOWN_VERSION, type PaperBreakdown, type PaperBreakdownSection } from "@/lib/research-paper-breakdown";
import { PaperBreakdownPanel } from "./paper-breakdown";
import { PaperAssessmentSteps, PaperWizardRoute, type PaperWizardNavigation } from "./paper-assessment-steps";
import { PAPER_ASSESSMENT_STEPS } from "@/lib/paper-assessment-wizard";
import { PaperClaimCriterion } from "./paper-evidence";
import Link from "next/link";
import { NEW_ASSESSMENT_PATH } from "@/lib/test-modules";

async function planFetch(id: string, ownerId: string, options: RequestInit = {}) {
  const token = await requireAccessToken(RESEARCH_SIGN_IN_REQUIRED, ownerId);
  const response = await fetch(`${EXPERIMENT_PLAN_PATH}?id=${id}`, { ...options, cache: "no-store", signal: options.signal ?? AbortSignal.timeout(110_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Experiment planning failed (HTTP ${response.status}).`);
  return validateExperimentPlanView(result, id);
}

type PlanningProps = { assessmentId: string; ownerId: string; breakdown: PaperBreakdown; preparation?: ReactNode };
export function PaperExperimentPlanning({ wizard = false, ...props }: PlanningProps & { wizard?: boolean }) {
  return wizard ? <PaperWizardRoute>{navigation => <PaperPlanningView {...props} wizard={navigation} />}</PaperWizardRoute> : <PaperPlanningView {...props} />;
}

function PaperPlanningView({ assessmentId, ownerId, breakdown, wizard, preparation }: PlanningProps & { wizard?: PaperWizardNavigation }) {
  const [view, setView] = useState<ExperimentPlanView | null>(null);
  const [review, setReview] = useState<ReviewedSections>(() => reviewedSections(breakdown));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const stepPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      try {
        const result = await planFetch(assessmentId, ownerId, { signal: controller.signal });
        if (!active) return;
        setView(result); setError("");
        if (planPending(result.stage)) timer = setTimeout(refresh, 5000);
      } catch (failure) {
        if (!active) return;
        setError(failure instanceof Error ? failure.message : "Experiment planning is unavailable.");
        timer = setTimeout(refresh, 15_000);
      }
    }
    void refresh();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [assessmentId, ownerId, revision]);
  async function action(action: "confirm" | "cancel") {
    if (!view || action === "confirm" && (!confirmed || view.stage !== "awaiting_confirmation")) return;
    setBusy(true); setError("");
    try {
      const payload = action === "confirm" ? { action, study_id: assessmentId, intake_revision: view.intake_revision, sections: review } : { action, study_id: assessmentId };
      const result = await planFetch(assessmentId, ownerId, { method: "POST", body: JSON.stringify(payload) });
      setView(result); setRevision(value => value + 1);
      if (action === "confirm" && result.stage !== "awaiting_confirmation") wizard?.navigate("implementation");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The confirmation could not be saved. Check status before retrying."); }
    finally { setBusy(false); }
  }
  function edit(section: PaperBreakdownSection, id: string, description: string | null) {
    setConfirmed(false);
    setReview(previous => ({ ...previous, [section]: description === null ? previous[section].filter(item => item.id !== id) : previous[section].some(item => item.id === id) ? previous[section].map(item => item.id === id ? { id, description } : item) : [...previous[section], { id, description }] }));
  }
  const awaiting = view?.stage === "awaiting_confirmation";
  const saved = view?.confirmed_breakdown ?? breakdown;
  const sources = Object.values(planningSources(saved)).flat();
  const hasConfirmation = Boolean(view && !awaiting);
  const requestedStep = wizard?.requestedStep ?? (hasConfirmation ? "implementation" : "breakdown");
  const step = !hasConfirmation || requestedStep === "upload" ? "breakdown" : requestedStep === "execution" && view?.stage !== "ready" ? "implementation" : requestedStep;
  const isWizard = Boolean(wizard);
  useEffect(() => { if (isWizard) stepPanel.current?.focus(); }, [step, isWizard]);
  const feedback = error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null;
  const confirmation = <div className="space-y-4">
        <p className="text-sm">Review Access, Experiment, Data and Validate above. Correct descriptions or exclude details before confirming. Source quotes and PDF pages stay with the original evidence.</p>
        <label className="flex items-start gap-2 text-sm"><Checkbox className="mt-0.5" checked={confirmed} disabled={busy} onCheckedChange={checked => setConfirmed(checked === true)} />I have reviewed all four sections and confirm this information for experiment planning.</label>
        <p className="text-sm text-muted-foreground">Confirmation saves this version and generates implementation steps. Experiments start in a later phase.</p>
        <Button disabled={busy || !confirmed || Object.values(review).flat().some(item => !item.description.trim())} onClick={() => void action("confirm")}>{busy ? "Saving confirmation…" : wizard ? "Confirm and continue" : "Confirm phase one and create experiment steps"}</Button>
      </div>;
  const breakdownPanel = <PaperBreakdownPanel version={PAPER_BREAKDOWN_VERSION} value={saved} preparing={false} busy={busy} review={awaiting ? review : undefined} onReviewChange={awaiting ? edit : undefined} />;
  const implementationPanel = <section aria-labelledby="experiment-planning-title" className="content-panel space-y-4 rounded-lg border p-4">
      <h2 id="experiment-planning-title" className="text-lg font-semibold">{wizard ? "Experiment Steps" : "Phase 2 · Experiment implementation steps"}</h2>
      {feedback}
      {!view ? <p role="status" className="text-sm">Checking phase-one confirmation…</p> : awaiting ? confirmation : <>
        <p className="text-sm">Phase one confirmed {new Date(view.confirmed_at!).toLocaleString()}.</p>
        <p role="status" className="text-sm font-medium">{view.stage === "ready" ? "Experiment steps ready" : view.stage === "cancelled" ? "Experiment planning cancelled" : view.stage === "failed" ? "Experiment planning needs attention" : view.stage === "uncertain" ? "Planning submission needs reconciliation" : "Preparing experiment implementation steps…"}</p>
        {view.reason ? <p className="text-sm text-muted-foreground">{view.reason}</p> : null}
        {view.stage === "processing" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void action("cancel")}>Cancel planning</Button> : null}
        {view.plan?.experiments.map((experiment, index) => <section key={index} aria-labelledby={`planned-experiment-${index}`} className="space-y-3 border-t pt-4">
          <h3 id={`planned-experiment-${index}`} className="font-semibold">{index + 1}. {experiment.title}</h3>
          <ol className="list-decimal space-y-4 pl-5">{experiment.steps.map((step, position) => <li key={position} className="space-y-1 pl-1 text-sm">
            <p className="font-medium">{step.title}{step.basis === "proposed" ? " · Proposed implementation" : ""}</p>
            <p className="whitespace-pre-wrap">{step.instructions}</p>
            {step.validation_ref ? <div className="space-y-1"><p className="font-medium">Validation check: {sources.find(s => s.ref === step.validation_ref)?.label ?? step.validation_ref}</p><PaperClaimCriterion criterion={sources.find(s => s.ref === step.validation_ref)!.criterion!} /></div> : null}
            {step.source_refs.length ? <details><summary className="cursor-pointer text-xs text-muted-foreground">Confirmed supporting details</summary><ul className="mt-2 space-y-2">{step.source_refs.map(ref => { const source = sources.find(s => s.ref === ref)!; return <li key={ref}><p>{source.description}</p>{(source.citations ?? [{ quote: source.quote, page: source.page }]).map((citation, i) => <div key={i}><p className="text-xs text-muted-foreground">PDF page {citation.page}</p><blockquote className="mt-1 whitespace-pre-wrap border-l-2 pl-3">{citation.quote}</blockquote></div>)}</li>; })}</ul></details> : null}
          </li>)}</ol>
          {experiment.open_questions.length ? <div className="space-y-2 text-sm"><h4 className="font-medium">Missing information and open questions</h4><ul className="list-disc space-y-1 pl-5">{experiment.open_questions.map((question, i) => <li key={i}>{question}</li>)}</ul></div> : null}
        </section>)}
      </>}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setRevision(value => value + 1)}>Check planning status</Button>
    </section>;
  if (!wizard) return <>{breakdownPanel}{implementationPanel}</>;
  return <>
    <PaperAssessmentSteps current={step} assessment implementation={hasConfirmation} execution={view?.stage === "ready"} busy={busy} onStep={wizard.navigate} />
    <section ref={stepPanel} tabIndex={-1} aria-label={`${PAPER_ASSESSMENT_STEPS.find(s => s.id === step)!.title} step`} className="scroll-mt-24 space-y-6 outline-none">
      {step === "breakdown" ? <>
        <h2 className="text-lg font-semibold">Initial Assessment</h2>
        {preparation}{breakdownPanel}{feedback}
        {!view ? <p role="status" className="text-sm">Checking phase-one confirmation…</p> : awaiting ? confirmation : <div className="space-y-3 border-t pt-4"><p className="text-sm">Phase one confirmed {new Date(view.confirmed_at!).toLocaleString()}.</p><Button disabled={busy} onClick={() => wizard.navigate("implementation")}>Next: Experiment Steps</Button></div>}
        {(!view || awaiting) ? <Button size="sm" variant="outline" disabled={busy} onClick={() => setRevision(value => value + 1)}>Check confirmation status</Button> : null}
        <div className="border-t pt-4"><Button variant="outline" disabled={busy} nativeButton={false} render={<Link href={NEW_ASSESSMENT_PATH} />}>Back to Paper Upload</Button></div>
      </> : step === "implementation" ? <>
        {implementationPanel}
        <div className="flex flex-wrap justify-between gap-3 border-t pt-4"><Button variant="outline" disabled={busy} onClick={() => wizard.navigate("breakdown")}>Back to Initial Assessment</Button><Button disabled={busy || view?.stage !== "ready"} onClick={() => wizard.navigate("execution")}>Next: Run Experiments</Button></div>
      </> : <>
        <section aria-labelledby="experiment-execution-title" className="content-panel space-y-4 rounded-lg border p-4"><h2 id="experiment-execution-title" className="text-lg font-semibold">Run Experiments</h2><p className="text-sm text-muted-foreground">Experiment execution is coming soon.</p><Button disabled>Run experiments</Button></section>
        <div className="border-t pt-4"><Button variant="outline" onClick={() => wizard.navigate("implementation")}>Back to Experiment Steps</Button></div>
      </>}
    </section>
  </>;
}
