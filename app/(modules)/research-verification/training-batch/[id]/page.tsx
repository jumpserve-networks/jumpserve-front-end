import Link from "next/link";
import { notFound } from "next/navigation";
import { ResearchHeader } from "@/app/components/research-workflow/header";
import { TrainingBatchProgress } from "@/app/components/research-workflow/training-batch-progress";
import { requireGoogleUser } from "@/lib/auth";
import { getTrainingBatchHistorySource, readTrainingBatch } from "@/lib/synthetic-batch-server";
import { TRAINING_BATCH_PATH, TRAINING_BATCHES_PATH } from "@/lib/test-modules";
import { parseTrainingBatchId } from "@/lib/training-batch";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = parseTrainingBatchId((await params).id);
  if (id === null) notFound();
  const user = await requireGoogleUser(`${TRAINING_BATCH_PATH}/${id}`);
  const source = getTrainingBatchHistorySource();
  if (!source) notFound();
  const initial = await readTrainingBatch(source, id, user.id).catch(() => undefined);
  if (initial === null) notFound();

  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    <Link className="text-sm underline" href={TRAINING_BATCHES_PATH}>Training Batches</Link>
    <ResearchHeader title={`Training Batch ${id}`} showModuleLabel={false} />
    <TrainingBatchProgress key={id} id={id} initial={initial} />
  </main>;
}
