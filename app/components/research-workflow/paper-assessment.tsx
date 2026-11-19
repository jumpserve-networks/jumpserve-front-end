"use client";
import { PaperQualityFeedback } from "./paper-quality-feedback";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { useUserPreferences } from "@/app/components/user-preferences";
import { ResearchHeader } from "./header";
import { PaperExperimentPlanning } from "./paper-experiment-planning";
import { PaperAssessmentSteps } from "./paper-assessment-steps";
import { paperIntakeFetch } from "@/lib/paper-intake-client";
import { ResearchRequestError } from "@/lib/research-workflow-api";
import { validatePaperIntake, type PaperIntakeView } from "@/lib/paper-intake";

export function PaperAssessment({ assessmentId, children, header, allowResume = false, wizard = false, embedded = false, ownerOnly = false }: { assessmentId: string; children: ReactNode; header?: ReactNode; allowResume?: boolean; wizard?: boolean; embedded?: boolean; ownerOnly?: boolean }) {
  const ownerId = useUserPreferences()?.userId ?? undefined;
  if (ownerOnly && !ownerId) return header ?? null;
  return <PaperAssessmentView key={`${assessmentId}:${ownerId ?? "public"}`} assessmentId={assessmentId} ownerId={ownerId} allowResume={allowResume} wizard={wizard} embedded={embedded} ownerOnly={ownerOnly} header={header}>{children}</PaperAssessmentView>;
}

function PaperAssessmentView({ assessmentId, ownerId, children, header, allowResume, wizard, embedded, ownerOnly }: { assessmentId: string; ownerId?: string; children: ReactNode; header?: ReactNode; allowResume: boolean; wizard: boolean; embedded: boolean; ownerOnly: boolean }) {
  const [view, setView] = useState<PaperIntakeView | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      try {
        const result = validatePaperIntake(await paperIntakeFetch(`?id=${assessmentId}`, { signal: controller.signal }, ownerId), assessmentId);
        if (!active) return;
        setView(result); setLegacy(false); setError("");
        if (["submitting", "processing"].includes(result.stage) || result.quality?.history_unavailable) timer = setTimeout(refresh, 5000);
      } catch (failure) {
        if (!active) return;
        if (failure instanceof ResearchRequestError && failure.status === 404) setLegacy(true);
        else { setError(failure instanceof Error ? failure.message : "Paper status is unavailable."); timer = setTimeout(refresh, 15_000); }
      }
    }
    void refresh();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [assessmentId, ownerId, revision]);
  async function action(action: "prepare" | "cancel" | "resume") {
    if (!ownerId) return;
    setBusy(true); setError("");
    try { setView(validatePaperIntake(await paperIntakeFetch("", { method: "POST", body: JSON.stringify({ action, request_id: assessmentId }) }, ownerId), assessmentId)); setLegacy(false); setRevision(r => r + 1); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Paper preparation could not be confirmed."); setRevision(r => r + 1); }
    finally { setBusy(false); }
  }
  const preparation = view ? <section className="content-panel space-y-3 rounded-lg border p-4" aria-label="Paper preparation status">
        <p role="status" className="text-sm font-medium">{view.stage === "uploaded" ? "Paper uploaded. Preparation has not started." : view.stage === "ready" ? "Paper breakdown ready" : view.stage === "cancelled" ? "Paper preparation cancelled" : view.stage === "uncertain" ? "Submission needs reconciliation" : view.status === "failed" ? "Paper needs attention" : "Preparing paper breakdown…"}</p>
        {view.authors?.length ? <p className="text-sm">{view.authors.join(", ")}</p> : null}
        {view.domain ? <p className="text-sm text-muted-foreground">{view.domain}</p> : null}
        {view.reason && view.reason !== "OpenAI is preparing the four paper sections." ? <p className="text-sm text-muted-foreground">{view.reason}</p> : null}
        <p className="text-xs text-muted-foreground">Updated {new Date(view.updated_at).toLocaleString()}</p>
        <div className="flex flex-wrap gap-2">
          {view.owner && view.stage === "uploaded" ? <Button size="sm" disabled={busy} onClick={() => void action("prepare")}>Prepare breakdown</Button> : null}
          {view.owner && ["uploaded", "processing", "uncertain"].includes(view.stage) ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void action("cancel")}>Cancel preparation</Button> : null}</div>
      </section> : null;
  if (ownerOnly && view && !view.owner) return header ?? null;
  if (legacy) return <>{header}{allowResume && ownerId ? <div className={embedded ? "space-y-2" : "mx-auto max-w-5xl space-y-2 px-4 pt-6"}><Button disabled={busy} onClick={() => void action("resume")}>Prepare paper in Next.js</Button>{error ? <p role="alert">{error}</p> : null}</div> : null}{children}</>;
  const showWizard = Boolean(wizard && view?.owner && ownerId);
  const Container = embedded ? "section" : "main";
  const pageHeader = header ?? (!embedded ? <ResearchHeader title={view?.title ?? "Paper assessment"} showModuleLabel={false} /> : null);
  const feedback = error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null;
  return <Container className={embedded ? "space-y-6" : "mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6"}>
    {!view ? <>{wizard ? <PaperAssessmentSteps current="breakdown" assessment /> : null}{pageHeader}{feedback}<p role="status">Loading paper preparation status…</p></> : showWizard && ownerId && view.stage === "ready" && view.breakdown ? <PaperExperimentPlanning key={`${assessmentId}:${view.breakdown.review?.id ?? view.breakdown.policy_sha256}`} assessmentId={assessmentId} ownerId={ownerId} title={view.title ?? "Paper assessment"} breakdown={view.breakdown} breakdownQuality={view.quality} header={error ? <>{pageHeader}{feedback}</> : pageHeader} wizard /> : <>
      {showWizard ? <PaperAssessmentSteps current="breakdown" assessment /> : null}
      {pageHeader}{feedback}
      {showWizard ? <h2 className="text-lg font-semibold">Paper Breakdown</h2> : null}
      {preparation}
      {view.stage !== "ready" ? <PaperQualityFeedback quality={view.quality} step={2} /> : null}
      {view.owner && ownerId && view.stage === "ready" && view.breakdown ? <PaperExperimentPlanning key={`${assessmentId}:${view.breakdown.review?.id ?? view.breakdown.policy_sha256}`} assessmentId={assessmentId} ownerId={ownerId} title={view.title ?? "Paper assessment"} breakdown={view.breakdown} breakdownQuality={view.quality} /> : !view.owner ? <p className="text-sm text-muted-foreground">The paper breakdown and source quotes are available to the paper’s owner.</p> : null}
      {!showWizard ? <section aria-labelledby="phase-one-queue" className="content-panel space-y-2 rounded-lg border p-4"><h2 id="phase-one-queue" className="text-lg font-semibold">Experiment Queue</h2><p className="text-sm">{view.experiment_jobs === 0 ? "No experiments have been queued." : `${view.experiment_jobs} recorded experiment jobs.`}</p></section> : null}
    </>}
  </Container>;
}
