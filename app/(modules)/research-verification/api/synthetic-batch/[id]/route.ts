import { getGoogleUser } from "@/lib/auth";
import { getTrainingBatchHistorySource, readTrainingBatch } from "@/lib/synthetic-batch-server";
import { parseTrainingBatchId } from "@/lib/training-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (value: unknown, status: number) => Response.json(value, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseTrainingBatchId((await params).id);
  const source = getTrainingBatchHistorySource();
  if (!source || id === null) return json({ error: "Training batch not found." }, 404);
  const user = await getGoogleUser().catch(() => undefined);
  if (user === undefined) return json({ error: "JumpServe could not verify your sign-in." }, 503);
  if (!user) return json({ error: "Sign in with Google to view this batch." }, 401);

  try {
    const batch = await readTrainingBatch(source, id, user.id);
    return batch ? json(batch, 200) : json({ error: "Training batch not found." }, 404);
  } catch {
    return json({ error: "Training batch progress is temporarily unavailable." }, 503);
  }
}
