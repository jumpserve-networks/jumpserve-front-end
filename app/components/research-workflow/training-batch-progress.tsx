"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LocalDateTime } from "@/app/components/user-preferences";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { ASSESSMENT_PATH, TRAINING_BATCH_STATUS_API_PATH } from "@/lib/test-modules";
import { isTrainingBatchActive, trainingBatchStatusLabels, type TrainingBatch, type TrainingBatchPaper } from "@/lib/training-batch";
import { TrainingBatchActivityDialog } from "./training-batch-activity-dialog";

const paperLabels: Record<TrainingBatchPaper["status"], string> = {
  pending: "Pending",
  generating: "Generating",
  verifying: "Verifying",
  passed: "Passed",
  stopped: "Stopped",
};
const stopLabels: Record<NonNullable<TrainingBatch["stopPhase"]>, string> = {
  generating: "Generation",
  saving_generator: "Saving the Generator result",
  verifying: "Verification",
  saving_verifier: "Saving the Verifier result",
};

export function TrainingBatchProgress({ id, initial }: { id: number; initial?: TrainingBatch }) {
  const [batch, setBatch] = useState(initial);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [activityPaperId, setActivityPaperId] = useState<string>();
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

  const passed = batch?.papers.filter(paper => paper.status === "passed").length ?? 0;
  const paperCount = batch?.papers.length ?? 0;
  const activityPaper = batch?.papers.find(paper => paper.id === activityPaperId);

  return <>
    {error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
      <p>{error}</p>
      <Button type="button" size="sm" variant="outline" onClick={() => setRefresh(value => value + 1)}>Refresh progress</Button>
    </div> : null}
    {batch ? <>
      <section className="content-panel space-y-3 rounded-lg border p-5">
        <div role="status" className="flex flex-wrap items-center gap-3">
          <Badge variant={batch.status === "failed" || batch.status === "stopped" ? "destructive" : "secondary"}>{trainingBatchStatusLabels[batch.status]}</Badge>
          {paperCount ? <span className="text-sm">{passed} of {paperCount} papers passed</span> : null}
        </div>
        {paperCount ? <progress aria-label="Papers passed" className="h-2 w-full accent-primary" value={passed} max={paperCount} /> : null}
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
          <TableHeader><TableRow><TableHead scope="col">Paper</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col">Verifier score</TableHead></TableRow></TableHeader>
          <TableBody>{batch.papers.map(paper => <TableRow key={paper.id}>
            <TableCell className="whitespace-normal">{paper.assessmentId
              ? <Link className="underline" href={`${ASSESSMENT_PATH}/${paper.assessmentId}`}>{paper.fileName}</Link>
              : paper.fileName}</TableCell>
            <TableCell>{batch.activityAvailable && paper.status !== "pending"
              ? <Button type="button" size="sm" variant="link" className="h-auto p-0 underline" aria-haspopup="dialog"
                aria-label={`${paperLabels[paper.status]}, view worker activity for ${paper.fileName}`}
                onClick={() => setActivityPaperId(paper.id)}>{paperLabels[paper.status]}</Button>
              : paperLabels[paper.status]}</TableCell>
            <TableCell>{paper.score ? `${paper.score.earned} / ${paper.score.maximum}` : "—"}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div> : null}
      <Dialog open={Boolean(activityPaper)} onOpenChange={open => { if (!open) setActivityPaperId(undefined); }}>
        {activityPaper ? <TrainingBatchActivityDialog key={activityPaper.id} batchId={id} paperId={activityPaper.id}
          filename={activityPaper.fileName} active={batch.status === "running" &&
            (activityPaper.status === "generating" || activityPaper.status === "verifying")} /> : null}
      </Dialog>
    </> : error ? null : <p role="status" className="text-sm">Loading batch progress…</p>}
  </>;
}
