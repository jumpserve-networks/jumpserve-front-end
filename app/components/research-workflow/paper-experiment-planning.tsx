"use client";

import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { requireAccessToken } from "@/lib/browser-auth";
import { RESEARCH_SIGN_IN_REQUIRED } from "@/lib/research-workflow-api";
import { EXPERIMENT_PLAN_PATH, planPending, planningSources, reviewedSections, validateExperimentPlanView, type ExperimentPlanView, type ReviewedSections } from "@/lib/paper-experiment-plan";
import { PAPER_BREAKDOWN_VERSION, type PaperBreakdown, type PaperBreakdownSection } from "@/lib/research-paper-breakdown";
import { PaperBreakdownPanel } from "./paper-breakdown";

async function planFetch(id: string, ownerId: string, options: RequestInit = {}) {
  const token = await requireAccessToken(RESEARCH_SIGN_IN_REQUIRED, ownerId);
  const response = await fetch(`${EXPERIMENT_PLAN_PATH}?id=${id}`, { ...options, cache: "no-store", signal: options.signal ?? AbortSignal.timeout(110_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Experiment planning failed (HTTP ${response.status}).`);
  return validateExperimentPlanView(result, id);
}

export function PaperExperimentPlanning({ assessmentId, ownerId, breakdown }: { assessmentId: string; ownerId: string; breakdown: PaperBreakdown }) {
  const [view, setView] = useState<ExperimentPlanView | null>(null);
  const [review, setReview] = useState<ReviewedSections>(() => reviewedSections(breakdown));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
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
      setView(await planFetch(assessmentId, ownerId, { method: "POST", body: JSON.stringify(payload) })); setRevision(value => value + 1);
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
  return <>
    <PaperBreakdownPanel version={PAPER_BREAKDOWN_VERSION} value={saved} preparing={false} busy={busy} review={awaiting ? review : undefined} onReviewChange={awaiting ? edit : undefined} />
    <section aria-labelledby="experiment-planning-title" className="content-panel space-y-4 rounded-lg border p-4">
      <h2 id="experiment-planning-title" className="text-lg font-semibold">Phase 2 · Experiment implementation steps</h2>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {!view ? <p role="status" className="text-sm">Checking phase-one confirmation…</p> : awaiting ? <>
        <p className="text-sm">Review Access, Experiment, Data and Validate above. Correct descriptions or exclude details before confirming. Source quotes and PDF pages stay with the original evidence.</p>
        <label className="flex items-start gap-2 text-sm"><Checkbox className="mt-0.5" checked={confirmed} disabled={busy} onCheckedChange={checked => setConfirmed(checked === true)} />I have reviewed all four sections and confirm this information for experiment planning.</label>
        <p className="text-sm text-muted-foreground">Confirmation saves this version and generates implementation steps. Experiments start in a later phase.</p>
        <Button disabled={busy || !confirmed || Object.values(review).flat().some(item => !item.description.trim())} onClick={() => void action("confirm")}>{busy ? "Saving confirmation…" : "Confirm phase one and create experiment steps"}</Button>
      </> : <>
        <p className="text-sm">Phase one confirmed {new Date(view.confirmed_at!).toLocaleString()}.</p>
        <p role="status" className="text-sm font-medium">{view.stage === "ready" ? "Experiment steps ready" : view.stage === "cancelled" ? "Experiment planning cancelled" : view.stage === "failed" ? "Experiment planning needs attention" : view.stage === "uncertain" ? "Planning submission needs reconciliation" : "Preparing experiment implementation steps…"}</p>
        {view.reason ? <p className="text-sm text-muted-foreground">{view.reason}</p> : null}
        {view.stage === "processing" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void action("cancel")}>Cancel planning</Button> : null}
        {view.plan?.experiments.map((experiment, index) => <section key={index} aria-labelledby={`planned-experiment-${index}`} className="space-y-3 border-t pt-4">
          <h3 id={`planned-experiment-${index}`} className="font-semibold">{index + 1}. {experiment.title}</h3>
          <ol className="list-decimal space-y-4 pl-5">{experiment.steps.map((step, position) => <li key={position} className="space-y-1 pl-1 text-sm">
            <p className="font-medium">{step.title}{step.basis === "proposed" ? " · Proposed implementation" : ""}</p>
            <p className="whitespace-pre-wrap">{step.instructions}</p>
            {step.source_refs.length ? <details><summary className="cursor-pointer text-xs text-muted-foreground">Confirmed supporting details</summary><ul className="mt-2 space-y-2">{step.source_refs.map(ref => { const source = sources.find(s => s.ref === ref)!; return <li key={ref}><p>{source.description} · PDF page {source.page}</p><blockquote className="mt-1 border-l-2 pl-3">{source.quote}</blockquote></li>; })}</ul></details> : null}
          </li>)}</ol>
          {experiment.open_questions.length ? <div className="space-y-2 text-sm"><h4 className="font-medium">Missing information and open questions</h4><ul className="list-disc space-y-1 pl-5">{experiment.open_questions.map((question, i) => <li key={i}>{question}</li>)}</ul></div> : null}
        </section>)}
      </>}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setRevision(value => value + 1)}>Check planning status</Button>
    </section>
  </>;
}
