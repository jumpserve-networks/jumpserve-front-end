import Link from "next/link";
import { ResearchHeader } from "@/app/components/research-workflow/header";
import { StartSyntheticBatch } from "@/app/components/research-workflow/start-synthetic-batch";
import { Badge } from "@/app/components/ui/badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { LocalDateTime } from "@/app/components/user-preferences";
import { requireGoogleUser } from "@/lib/auth";
import { getSyntheticBatchConfiguration, getTrainingBatchHistorySource, listTrainingBatches } from "@/lib/synthetic-batch-server";
import { TRAINING_BATCH_PATH, TRAINING_BATCHES_PATH } from "@/lib/test-modules";
import { trainingBatchStatusLabels } from "@/lib/training-batch";

export const dynamic = "force-dynamic";

const historyPath = (page: number) => page > 1 ? `${TRAINING_BATCHES_PATH}?page=${page}` : TRAINING_BATCHES_PATH;

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const { page } = await searchParams;
  const current = typeof page === "string" && /^[1-9][0-9]{0,7}$/.test(page) ? Number(page) : 1;
  const user = await requireGoogleUser(historyPath(current));
  const source = getTrainingBatchHistorySource();
  const configuration = getSyntheticBatchConfiguration();
  const history = source ? await listTrainingBatches(source, current).catch(() => null) : null;

  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <ResearchHeader title="Training Batches" showModuleLabel={false} />
    {user.id === configuration?.ownerId ? <section className="content-panel space-y-4 rounded-lg border p-5">
      <p className="text-sm">Run the Generator and Verifier on the synthetic papers. The batch stops if a paper fails to earn full credit.</p>
      <StartSyntheticBatch />
    </section> : null}
    {history ? <>
      {source?.kind === "local" ? <p className="text-sm text-muted-foreground">Showing archived local batches.</p> : null}
      {history.batches.length ? <div className="content-panel rounded-lg border">
        <Table className="min-w-[34rem]">
          <TableCaption className="sr-only">Training batch history</TableCaption>
          <TableHeader><TableRow>
            <TableHead scope="col">Batch</TableHead>
            <TableHead scope="col">Date</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col">Papers passed</TableHead>
          </TableRow></TableHeader>
          <TableBody>{history.batches.map(batch => <TableRow key={batch.id}>
            <TableCell><Link className="underline" prefetch={false} href={`${TRAINING_BATCH_PATH}/${batch.id}`}>{batch.id}</Link></TableCell>
            <TableCell><LocalDateTime value={batch.recordedAt} /></TableCell>
            <TableCell><Badge variant={batch.status === "failed" || batch.status === "stopped" ? "destructive" : "secondary"}>{trainingBatchStatusLabels[batch.status]}</Badge></TableCell>
            <TableCell>{batch.total ? `${batch.passed} of ${batch.total}` : "—"}</TableCell>
          </TableRow>)}</TableBody>
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
