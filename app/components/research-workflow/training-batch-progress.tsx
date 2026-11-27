"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LocalDateTime } from "@/app/components/user-preferences";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { ASSESSMENT_PATH, TRAINING_BATCH_STATUS_API_PATH } from "@/lib/test-modules";
import {
  formatTrainingBatchDuration,
  isTrainingBatchActive,
  trainingBatchStatusLabels,
  trainingBatchStepLabels,
  trainingBatchSteps,
  type TrainingBatch,
  type TrainingBatchPaper,
  type TrainingBatchStep,
} from "@/lib/training-batch";
import { TrainingBatchActivityDialog } from "./training-batch-activity-dialog";
import { TrainingBatchLaunchGraphic } from "./training-batch-launch-graphic";

const paperLabels: Record<TrainingBatchPaper["status"], string> = {
  pending: "Pending",
  generating: "Generating",
  verifying: "Verifying",
  passed: "Passed",
  completed: "Completed",
  verification_error: "Verification error",
  stopped: "Stopped",
  interrupted: "Interrupted",
};
const stopLabels: Record<NonNullable<TrainingBatch["stopPhase"]>, string> = {
  generating: "Generation",
  saving_generator: "Saving the Generator result",
  verifying: "Verification",
  saving_verifier: "Saving the Verifier result",
};
const stepStatusLabels = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  stopped: "Stopped",
  interrupted: "Interrupted",
  unknown: "Status unavailable",
};

function legacyStepStatus(paper: TrainingBatchPaper, role: TrainingBatchStep) {
  if (paper.status === "pending") return "pending";
  if (paper.status === "generating") return role === "generator" ? "running" : "pending";
  if (paper.status === "verifying") return role === "generator" ? "completed" : "running";
  if (paper.status === "passed" || paper.status === "completed" ||
      (role === "generator" && (paper.assessmentId || paper.score))) return "completed";
  return "unknown";
}

function paperStep(paper: TrainingBatchPaper, role: TrainingBatchStep, active: boolean, now: number):
  { status: keyof typeof stepStatusLabels; elapsed: string } {
  const step = paper.steps?.[role];
  const recordedStatus = paper.steps ? step?.status ?? "pending" : legacyStepStatus(paper, role);
  const status = recordedStatus === "running" && !active ? "interrupted" : recordedStatus;
  const startTime = status === "running" && step?.startedAt ? Date.parse(step.startedAt) : NaN;
  const duration = Number.isFinite(startTime) && Number.isFinite(now) ? Math.max(0, now - startTime) : step?.durationMs;
  const elapsed = typeof duration === "number" ? formatTrainingBatchDuration(duration)
    : status === "completed" || status === "stopped" || status === "interrupted" ? "Time unavailable" : "";
  return { status, elapsed };
}

function PaperSteps({ paper, active, now, onOpenDetails }: {
  paper: TrainingBatchPaper;
  active: boolean;
  now: number;
  onOpenDetails: (role: TrainingBatchStep, trigger: HTMLButtonElement) => void;
}) {
  return <ol aria-label={`Assessment steps for ${paper.fileName}`}
    className="mt-2 space-y-1 border-l pl-3 text-xs">
    {trainingBatchSteps.map(role => {
      const { status, elapsed } = paperStep(paper, role, active, now);
      const label = trainingBatchStepLabels[role];
      return <li key={role} className="flex flex-wrap items-baseline gap-x-2">
        {status === "pending" ? <span className="font-medium">{label}</span> :
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs font-medium underline"
            aria-haspopup="dialog" aria-label={`View ${label} details for ${paper.fileName}`}
            onClick={event => onOpenDetails(role, event.currentTarget)}>{label}</Button>}
        <span className="text-muted-foreground">{stepStatusLabels[status]}</span>
        {elapsed ? <span className="tabular-nums text-muted-foreground"
          role={status === "running" ? "timer" : undefined}>{elapsed}</span> : null}
      </li>;
    })}
  </ol>;
}

export function TrainingBatchProgress({ id, initial }: { id: number; initial?: TrainingBatch }) {
  const [batch, setBatch] = useState(initial);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState<number>();
  const [activitySelection, setActivitySelection] = useState<{ paperId: string; role: TrainingBatchStep }>();
  const activityTrigger = useRef<HTMLButtonElement>(null);
  const hasInitial = initial !== undefined;
  const shouldPoll = !initial || isTrainingBatchActive(initial.status);

  useEffect(() => {
    if (!shouldPoll) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`${TRAINING_BATCH_STATUS_API_PATH}/${id}`, {
          cache: "no-store", signal: controller.signal,
        });
        if ([401, 403, 404].includes(response.status)) {
          if (!controller.signal.aborted) {
            setBatch(undefined);
            setError(response.status === 401 ? "Sign in again to view this batch." : "Training batch is unavailable.");
          }
          return;
        }
        if (!response.ok) throw new Error("Batch status unavailable");
        const next: TrainingBatch = await response.json();
        if (controller.signal.aborted) return;
        setBatch(next);
        setError("");
        if (!isTrainingBatchActive(next.status)) return;
      } catch {
        if (controller.signal.aborted) return;
        setError("Progress could not be refreshed. The last reported status may be out of date.");
      }
      timer = setTimeout(poll, 10_000);
    }
    if (hasInitial && !refresh) timer = setTimeout(poll, 10_000);
    else void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id, hasInitial, refresh, shouldPoll]);

  const completed = batch?.papers.filter(paper => paper.status === "passed" || paper.status === "completed").length ?? 0;
  const verificationErrors = batch?.papers.filter(paper => paper.status === "verification_error").length ?? 0;
  const paperCount = batch?.papers.length ?? 0;
  const batchActive = !!batch && isTrainingBatchActive(batch.status);
  const hasRunningTimer = batchActive && batch.papers.some(paper =>
    trainingBatchSteps.some(role => paper.steps?.[role]?.status === "running" && paper.steps[role].startedAt));
  useEffect(() => {
    if (!hasRunningTimer) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [hasRunningTimer]);
  const publishedAt = Date.parse(batch?.updatedAt ?? "");
  const elapsedAsOf = Number.isFinite(publishedAt) ? Math.max(now ?? publishedAt, publishedAt) : now ?? NaN;
  const activityPaper = batch?.papers.find(paper => paper.id === activitySelection?.paperId);
  const role = activitySelection?.role;
  const selectedStep = activityPaper && role ? paperStep(activityPaper, role, batchActive, elapsedAsOf) : undefined;

  function openActivity(paperId: string, role: TrainingBatchStep, trigger: HTMLButtonElement) {
    activityTrigger.current = trigger;
    setActivitySelection({ paperId, role });
  }

  return <>
    {error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
      <p>{error}</p>
      <Button type="button" size="sm" variant="outline" onClick={() => setRefresh(value => value + 1)}>Refresh progress</Button>
    </div> : null}
    {batch ? <>
      <section className="content-panel space-y-3 rounded-lg border p-5">
        <div role="status" className="flex flex-wrap items-center gap-3">
          <Badge variant={batch.status === "failed" || batch.status === "stopped" ? "destructive" : "secondary"}>{trainingBatchStatusLabels[batch.status]}</Badge>
          {paperCount ? <span className="text-sm">{completed} of {paperCount} papers completed
            {verificationErrors ? ` · ${verificationErrors} verification ${verificationErrors === 1 ? "error" : "errors"}` : ""}
          </span> : null}
        </div>
        {batchActive && batch.status !== "running" ? <TrainingBatchLaunchGraphic /> : null}
        {paperCount ? <progress aria-label="Papers completed" className="h-2 w-full accent-primary" value={completed} max={paperCount} /> : null}
        {batch.status === "unconfirmed" ? <p className="text-sm">JumpServe is waiting for the first progress report from AWS.</p> : null}
        {batch.stale ? <p role="alert" className="text-sm">The last progress report is over a minute old.</p> : null}
        {batch.stopPhase ? <p className="text-sm">Stopped during {stopLabels[batch.stopPhase].toLowerCase()}.</p> : null}
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {batch.requestedAt ? <div><dt className="text-muted-foreground">Requested</dt><dd><LocalDateTime value={batch.requestedAt} /></dd></div> : null}
          {batch.startedAt ? <div><dt className="text-muted-foreground">Started</dt><dd><LocalDateTime value={batch.startedAt} /></dd></div> : null}
          {batch.finishedAt ? <div><dt className="text-muted-foreground">Finished</dt><dd><LocalDateTime value={batch.finishedAt} /></dd></div> : null}
          {batch.updatedAt && !batch.finishedAt ? <div><dt className="text-muted-foreground">Last reported</dt><dd><LocalDateTime value={batch.updatedAt} /></dd></div> : null}
          {batch.versions.generator ? <div><dt className="text-muted-foreground">Generator</dt><dd>v{batch.versions.generator}</dd></div> : null}
          {batch.versions.verifier ? <div><dt className="text-muted-foreground">Verifier</dt><dd>v{batch.versions.verifier}</dd></div> : null}
        </dl>
      </section>
      {paperCount ? <div className="content-panel rounded-lg border">
        <Table className="min-w-[26rem]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Paper</TableHead>
              <TableHead scope="col">Assessment ID</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Verifier score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{batch.papers.map(paper => <TableRow key={paper.id}>
            <TableCell className="whitespace-normal">
              {batch.canViewAssessmentLinks && paper.assessmentId
                ? <Link className="underline" href={`${ASSESSMENT_PATH}/${paper.assessmentId}`}>{paper.fileName}</Link>
                : paper.fileName}
              <PaperSteps paper={paper} active={batchActive} now={elapsedAsOf}
                onOpenDetails={(step, trigger) => openActivity(paper.id, step, trigger)} />
            </TableCell>
            <TableCell className="whitespace-normal">
              {paper.assessmentId ? <code className="break-all text-xs">{paper.assessmentId}</code> : "—"}
            </TableCell>
            <TableCell>{paperLabels[paper.status]}</TableCell>
            <TableCell>{paper.score ? `${paper.score.earned} / ${paper.score.maximum}` : "—"}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div> : null}
      <Dialog open={Boolean(activityPaper)} onOpenChange={open => { if (!open) setActivitySelection(undefined); }}>
        {activityPaper && role && selectedStep ? <TrainingBatchActivityDialog key={`${activityPaper.id}:${role}`}
          batchId={id} paperId={activityPaper.id} filename={activityPaper.fileName}
          finalFocus={activityTrigger} activityAvailable={batch.activityAvailable === true}
          active={batch.status === "running" && selectedStep.status === "running"}
          step={{
            role, status: stepStatusLabels[selectedStep.status], elapsed: selectedStep.elapsed, version: batch.versions[role],
            score: role === "verifier" ? activityPaper.score : null,
          }} /> : null}
      </Dialog>
    </> : error ? null : <p role="status" className="text-sm">Loading batch progress…</p>}
  </>;
}
