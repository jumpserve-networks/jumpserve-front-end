import Link from "next/link";
import { StartSyntheticBatch } from "@/app/components/research-workflow/start-synthetic-batch";
import { TrainingBatchHistoryRow } from "@/app/components/research-workflow/training-batch-history-row";
import { Badge } from "@/app/components/ui/badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { LocalDateTime } from "@/app/components/user-preferences";
import { requireGoogleUser } from "@/lib/auth";
import { getSyntheticBatchConfiguration, getTrainingBatchHistorySource, listTrainingBatches } from "@/lib/synthetic-batch-server";
import { TRAINING_BATCHES_PATH } from "@/lib/test-modules";
import { trainingBatchStatusLabels, type TrainingBatchPaper } from "@/lib/training-batch";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const historyPath = (page: number) => page > 1 ? `${TRAINING_BATCHES_PATH}?page=${page}` : TRAINING_BATCHES_PATH;

const paperOutcomes = {
  passed: { label: "Passed", symbol: "✓", color: "bg-success text-background" },
  imperfect: { label: "Imperfect", symbol: "•", color: "bg-warning text-background" },
  error: { label: "Error", symbol: "×", color: "bg-destructive text-destructive-foreground" },
  unfinished: { label: "Unfinished", symbol: "–", color: "bg-muted text-muted-foreground ring-1 ring-inset ring-border" },
} as const;

type PaperOutcome = keyof typeof paperOutcomes;

const paperStatuses: Record<TrainingBatchPaper["status"], { outcome: PaperOutcome; label: string }> = {
  passed: { outcome: "passed", label: "Passed" },
  completed: { outcome: "imperfect", label: "Imperfect" },
  generation_error: { outcome: "error", label: "Generation error" },
  verification_error: { outcome: "error", label: "Verification error" },
  pending: { outcome: "unfinished", label: "Pending" },
  generating: { outcome: "unfinished", label: "Generating" },
  verifying: { outcome: "unfinished", label: "Verifying" },
  stopped: { outcome: "unfinished", label: "Stopped" },
  interrupted: { outcome: "unfinished", label: "Interrupted" },
};

function OutcomeSquare({ outcome }: { outcome: (typeof paperOutcomes)[PaperOutcome] }) {
  return <span aria-hidden="true" className={cn(
    "inline-flex size-4 shrink-0 items-center justify-center rounded-xs text-xs leading-none font-semibold",
    outcome.color,
  )}>{outcome.symbol}</span>;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const { page } = await searchParams;
  const current = typeof page === "string" && /^[1-9][0-9]{0,7}$/.test(page) ? Number(page) : 1;
  const user = await requireGoogleUser(historyPath(current));
  const source = getTrainingBatchHistorySource();
  const configuration = getSyntheticBatchConfiguration();
  const history = source ? await listTrainingBatches(source, current).catch(() => null) : null;

  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <StartSyntheticBatch title="Training Batches" disabled={user.id !== configuration?.ownerId} />
    {history ? <>
      {source?.kind === "local" ? <p className="text-sm text-muted-foreground">Showing archived local batches.</p> : null}
      {history.batches.length ? <div className="content-panel rounded-lg border">
        <ul role="list" aria-label="Paper outcome legend" className="flex flex-wrap gap-x-4 gap-y-2 border-b px-3 py-2 text-xs text-muted-foreground">
          {Object.values(paperOutcomes).map(outcome => <li key={outcome.label} className="flex items-center gap-1.5">
            <OutcomeSquare outcome={outcome} />
            {outcome.label}
          </li>)}
        </ul>
        <Table className="min-w-[34rem]">
          <TableCaption className="sr-only">Training batch history</TableCaption>
          <TableHeader><TableRow>
            <TableHead scope="col">Batch</TableHead>
            <TableHead scope="col">Date</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col">Paper outcomes</TableHead>
          </TableRow></TableHeader>
          <TableBody>{history.batches.map(batch => <TrainingBatchHistoryRow key={batch.id} batchId={batch.id}>
            <TableCell><LocalDateTime value={batch.recordedAt} /></TableCell>
            <TableCell><Badge variant={batch.status === "failed" || batch.status === "stopped" ? "destructive" : "secondary"}>{trainingBatchStatusLabels[batch.status]}</Badge></TableCell>
            <TableCell>{batch.total ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <ul role="list" aria-label={`Paper outcomes for batch ${batch.id}`} className="flex flex-wrap gap-1">
                {batch.papers.map(paper => {
                  const { outcome, label } = paperStatuses[paper.status] ?? { outcome: "unfinished", label: "Status unavailable" };
                  const description = `${paper.fileName} · ${label}`;
                  return <li key={paper.id} title={description} className="flex">
                    <OutcomeSquare outcome={paperOutcomes[outcome]} />
                    <span className="sr-only">{description}</span>
                  </li>;
                })}
              </ul>
              <span className="text-xs text-muted-foreground tabular-nums">{batch.passed} of {batch.total} passed</span>
            </div> : "—"}</TableCell>
          </TrainingBatchHistoryRow>)}</TableBody>
        </Table>
      </div> : <p className="text-sm">{current === 1 ? "No training batches have been recorded." : "No training batches on this page."}</p>}
      {current > 1 || history.hasMore ? <nav className="flex gap-4 text-sm" aria-label="Training batch pages">
        {current > 1 ? <Link className="underline" href={historyPath(current - 1)}>Previous page</Link> : null}
        {history.hasMore ? <Link className="underline" href={historyPath(current + 1)}>Next page</Link> : null}
      </nav> : null}
    </> : source
      ? <p role="alert" className="text-sm">Training batch history could not be loaded.</p>
      : <p className="text-sm">Training batch history is unconfigured for this environment.</p>}
  </main>;
}
