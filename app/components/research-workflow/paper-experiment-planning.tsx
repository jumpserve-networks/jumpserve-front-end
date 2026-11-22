"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { requireAccessToken } from "@/lib/browser-auth";
import { RESEARCH_SIGN_IN_REQUIRED } from "@/lib/research-workflow-api";
import { EXPERIMENT_PLAN_PATH, planPending, reviewedSections, validateExperimentPlanView, type ExperimentPlanView, type ReviewedSections } from "@/lib/paper-experiment-plan";
import { PAPER_BREAKDOWN_VERSION, type PaperBreakdown, type PaperBreakdownSection } from "@/lib/research-paper-breakdown";
import { PaperBreakdownPanel } from "./paper-breakdown";
import { PaperAssessmentSteps, PaperWizardRoute, type PaperWizardNavigation } from "./paper-assessment-steps";
import { EXPERIMENT_SETUP_TITLE, PAPER_ASSESSMENT_STEPS } from "@/lib/paper-assessment-wizard";
import { PaperExperimentPlanOutline } from "./paper-experiment-plan-outline";
import { PaperExperimentScripts } from "./paper-experiment-scripts";
import { usePaperWork } from "./paper-work-provider";
import { PaperQualityHistoryMenu, PaperQualityHistoryProvider } from "./paper-quality-history-dialog";
import type { PaperQualityProgress } from "@/lib/paper-quality";

async function planFetch(id: string, ownerId: string, options: RequestInit = {}) {
  const token = await requireAccessToken(RESEARCH_SIGN_IN_REQUIRED, ownerId);
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(110_000)]) : AbortSignal.timeout(110_000);
  signal.throwIfAborted();
  const response = await fetch(`${EXPERIMENT_PLAN_PATH}?id=${id}`, { ...options, cache: "no-store", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Experiment planning failed (HTTP ${response.status}).`);
  return validateExperimentPlanView(result, id);
}

type PlanningProps = { assessmentId: string; ownerId: string; breakdown: PaperBreakdown; header?: ReactNode; title?: string };
export function PaperExperimentPlanning({ wizard = false, ...props }: PlanningProps & { wizard?: boolean }) {
  return wizard ? <PaperWizardRoute>{navigation => <PaperPlanningView {...props} wizard={navigation} />}</PaperWizardRoute> : <PaperPlanningView {...props} />;
}

function PaperPlanningView({ assessmentId, ownerId, breakdown, header, wizard, title = "Paper assessment" }: PlanningProps & { wizard?: PaperWizardNavigation }) {
  const work = usePaperWork();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true;return () => { mounted.current = false; }; }, []);
  const [view, setView] = useState<ExperimentPlanView | null>(null);
  const [review, setReview] = useState<ReviewedSections>(() => reviewedSections(breakdown));
  const [editingDetail, setEditingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [scriptHistory, setScriptHistory] = useState<Record<number, PaperQualityProgress | undefined>>({});
  const updateScriptHistory = useCallback((index: number, quality: PaperQualityProgress | undefined) => {
    setScriptHistory(previous => previous[index] === quality ? previous : { ...previous, [index]: quality });
  }, []);
  const invalidReview = Object.values(review).flat().some(item => !item.description.trim());
  const stepPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      try {
        const result = await planFetch(assessmentId, ownerId, { signal: controller.signal });
        if (!active) return;
        setView(result); setError("");
        if (planPending(result.stage) || result.quality?.history_unavailable) timer = setTimeout(refresh, 5000);
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
    if (!view || busy || action === "confirm" && (invalidReview || editingDetail || view.stage !== "awaiting_confirmation")) return;
    setBusy(true); setError("");
    try {
      const payload = action === "confirm" ? { action, study_id: assessmentId, intake_revision: view.intake_revision, sections: review } : { action, study_id: assessmentId };
      const result = await work.perform({ id: assessmentId, title, step: 3 }, signal => planFetch(assessmentId, ownerId, { method: "POST", body: JSON.stringify(payload), signal }));
      if (!mounted.current) return;
      setView(result); setRevision(value => value + 1);
      if (action === "confirm" && result.stage !== "awaiting_confirmation") wizard?.navigate("implementation");
    } catch (failure) { if (mounted.current) { setError(failure instanceof Error ? failure.message : "The confirmation could not be saved. The saved status will be checked automatically."); setRevision(value => value + 1); } }
    finally { if (mounted.current) setBusy(false); }
  }
  function edit(section: PaperBreakdownSection, id: string, description: string | null) {
    setReview(previous => ({ ...previous, [section]: description === null ? previous[section].filter(item => item.id !== id) : previous[section].some(item => item.id === id) ? previous[section].map(item => item.id === id ? { id, description } : item) : [...previous[section], { id, description }] }));
  }
  const awaiting = view?.stage === "awaiting_confirmation";
  const saved = view?.confirmed_breakdown ?? breakdown;
  const hasConfirmation = Boolean(view && !awaiting);
  const requestedStep = wizard?.requestedStep ?? (hasConfirmation ? "implementation" : "breakdown");
  const step = !hasConfirmation || requestedStep === "upload" ? "breakdown"
    : requestedStep === "execution" && view?.stage === "ready" ? "execution"
    : requestedStep === "breakdown" ? "breakdown" : "implementation";
  const isWizard = Boolean(wizard);
  useEffect(() => { if (isWizard) stepPanel.current?.focus(); }, [step, isWizard]);
  const feedback = error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null;
  const confirmation = <div className="flex justify-end">
        <Button disabled={busy || invalidReview || editingDetail} onClick={() => void action("confirm")}>{busy ? "Saving confirmation…" : wizard ? "Continue to Step 3" : "Confirm phase one and create experiment steps"}</Button>
      </div>;
  const breakdownPanel = <PaperBreakdownPanel key={`${saved.source_id}:${saved.policy_sha256}:${awaiting ? "review" : "confirmed"}`} version={PAPER_BREAKDOWN_VERSION} value={saved} preparing={false} busy={busy} review={awaiting ? review : undefined} onReviewChange={awaiting ? edit : undefined} onEditingChange={setEditingDetail} />;
  const implementationPanel = <section aria-labelledby="experiment-planning-title" className="space-y-5">
      <div className="flex items-start justify-between gap-3"><h2 id="experiment-planning-title" className="text-lg font-semibold">{wizard ? "Experiment Steps" : "Phase 2 · Experiment implementation steps"}</h2>{!wizard ? <PaperQualityHistoryMenu /> : null}</div>
      {feedback}
      {!view ? <p role="status" className="text-sm">Checking phase-one confirmation…</p> : awaiting ? confirmation : <>
        {view.stage !== "ready" && !view.quality ? <p role="status" className="text-sm font-medium">{view.stage === "cancelled" ? "Experiment planning cancelled" : view.stage === "failed" ? "Experiment planning needs attention" : view.stage === "uncertain" ? "Planning submission needs reconciliation" : "Preparing experiment implementation steps…"}</p> : null}
        {view.reason && !view.quality ? <p className="text-sm text-muted-foreground">{view.reason}</p> : null}
        {view.stage === "processing" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void action("cancel")}>Cancel planning</Button> : null}
        {view.plan ? <PaperExperimentPlanOutline plan={view.plan} breakdown={saved} /> : null}
      </>}
    </section>;
  if (!wizard) return <PaperQualityHistoryProvider quality={view?.quality} step={3}>{header}{breakdownPanel}{implementationPanel}</PaperQualityHistoryProvider>;
  return <PaperQualityHistoryProvider step={step === "breakdown" ? null : step === "implementation" ? 3 : 4} quality={view?.quality} entries={step === "execution" ? view?.plan?.experiments.map((experiment, index) => ({ id: `experiment-${index + 1}`, label: `Experiment ${index + 1}: ${experiment.title}`, quality: scriptHistory[index + 1] })) ?? [] : undefined}>
    <PaperAssessmentSteps current={step} assessment implementation={hasConfirmation} execution={view?.stage === "ready"} busy={busy || editingDetail} onStep={wizard.navigate} />
    {header}
    <section ref={stepPanel} tabIndex={-1} aria-label={`${PAPER_ASSESSMENT_STEPS.find(s => s.id === step)!.title} step`} className="scroll-mt-24 space-y-6 outline-none">
      {step === "breakdown" ? <>
        <h2 className="text-lg font-semibold">Paper Breakdown</h2>
        {breakdownPanel}{feedback}
        {!view ? <p role="status" className="text-sm">Checking phase-one confirmation…</p> : awaiting ? confirmation : <div className="border-t pt-4"><Button disabled={busy} onClick={() => wizard.navigate("implementation")}>Next: Experiment Steps</Button></div>}
      </> : step === "implementation" ? <>
        {implementationPanel}
        <div className="flex flex-wrap justify-between gap-3 border-t pt-4"><Button variant="outline" disabled={busy} onClick={() => wizard.navigate("breakdown")}>Back to Paper Breakdown</Button><Button disabled={busy || view?.stage !== "ready"} onClick={() => wizard.navigate("execution")}>Continue to Step 4</Button></div>
      </> : <>
        <section aria-labelledby="experiment-execution-title" className="space-y-6"><h2 id="experiment-execution-title" className="text-lg font-semibold">{EXPERIMENT_SETUP_TITLE}</h2>
          {view?.plan?.experiments.length === 0 ? <p>No experiments were included in the confirmed assessment.</p> : view?.plan?.experiments.map((_, index) => <PaperExperimentScripts key={`${assessmentId}:${ownerId}:${index + 1}`} assessmentId={assessmentId} ownerId={ownerId} title={title} index={index + 1} plan={view.plan!} breakdown={saved} onQualityChange={updateScriptHistory} />)}
        </section>
        <div className="border-t pt-4"><Button variant="outline" onClick={() => wizard.navigate("implementation")}>Back to Experiment Steps</Button></div>
      </>}
    </section>
  </PaperQualityHistoryProvider>;
}
