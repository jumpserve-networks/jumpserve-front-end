"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { useUserPreferences } from "@/app/components/user-preferences";
import { ResearchHeader } from "./header";
import { PaperBreakdownPanel } from "./paper-breakdown";
import { paperIntakeFetch } from "@/lib/paper-intake-client";
import { ResearchRequestError } from "@/lib/research-workflow-api";
import { paperIntakePending, validatePaperIntake, type PaperIntakeView } from "@/lib/paper-intake";

export function PaperAssessment({ assessmentId, children, allowResume = false }: { assessmentId: string; children: ReactNode; allowResume?: boolean }) {
  const ownerId = useUserPreferences()?.userId ?? undefined;
  return <PaperAssessmentView key={`${assessmentId}:${ownerId ?? "public"}`} assessmentId={assessmentId} ownerId={ownerId} allowResume={allowResume}>{children}</PaperAssessmentView>;
}

function PaperAssessmentView({ assessmentId, ownerId, children, allowResume }: { assessmentId: string; ownerId?: string; children: ReactNode; allowResume: boolean }) {
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
        if (paperIntakePending(result.stage)) timer = setTimeout(refresh, 5000);
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
    catch (failure) { setError(failure instanceof Error ? failure.message : "Paper preparation could not be confirmed."); }
    finally { setBusy(false); }
  }
  if (legacy) return <>{allowResume && ownerId ? <div className="mx-auto max-w-5xl space-y-2 px-4 pt-6"><Button disabled={busy} onClick={() => void action("resume")}>Prepare paper in Next.js</Button>{error ? <p role="alert">{error}</p> : null}</div> : null}{children}</>;
  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
    <ResearchHeader title={view?.title ?? "Paper assessment"} showModuleLabel={false} />
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {!view ? <p role="status">Loading paper preparation status…</p> : <>
      <section className="space-y-3 rounded-lg border p-4" aria-label="Paper preparation status">
        <p role="status" className="text-sm font-medium">{view.stage === "ready" ? "Paper breakdown ready" : view.stage === "cancelled" ? "Paper preparation cancelled" : view.stage === "uncertain" ? "Submission needs reconciliation" : view.status === "failed" ? "Paper needs attention" : "Preparing paper breakdown…"}</p>
        {view.authors?.length ? <p className="text-sm">{view.authors.join(", ")}</p> : null}
        {view.domain ? <p className="text-sm text-muted-foreground">{view.domain}</p> : null}
        {view.reason ? <p className="text-sm text-muted-foreground">{view.reason}</p> : null}
        <p className="text-xs text-muted-foreground">Updated {new Date(view.updated_at).toLocaleString()}</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => setRevision(r => r + 1)}>Check status</Button>
          {view.owner && view.stage === "uploaded" ? <Button size="sm" disabled={busy} onClick={() => void action("prepare")}>Prepare breakdown</Button> : null}
          {view.owner && ["uploaded", "processing", "uncertain"].includes(view.stage) ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void action("cancel")}>Cancel preparation</Button> : null}</div>
      </section>
      {view.owner ? <PaperBreakdownPanel version="paper-breakdown-v1" value={view.breakdown} preparing={paperIntakePending(view.stage)} busy={busy} /> : <p className="text-sm text-muted-foreground">The paper breakdown and source quotes are available to the paper’s owner.</p>}
      <section aria-labelledby="phase-one-queue" className="space-y-2 rounded-lg border p-4"><h2 id="phase-one-queue" className="text-lg font-semibold">Experiment Queue</h2><p className="text-sm">{view.experiment_jobs === 0 ? "No experiments have been queued. This assessment prepares the paper breakdown only." : `${view.experiment_jobs} recorded experiment jobs.`}</p></section>
    </>}
  </main>;
}
