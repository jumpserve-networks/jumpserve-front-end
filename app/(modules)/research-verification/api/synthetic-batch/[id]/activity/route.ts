import { getGoogleUser } from "@/lib/auth";
import { getTrainingBatchHistorySource, readTrainingBatchActivity } from "@/lib/synthetic-batch-server";
import { isTrainingBatchPaperId } from "@/lib/training-batch-activity";
import { parseTrainingBatchId } from "@/lib/training-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (value: unknown, status: number) => Response.json(value, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseTrainingBatchId((await params).id);
  const paperId = new URL(request.url).searchParams.get("paper");
  const source = getTrainingBatchHistorySource();
  if (source?.kind !== "s3" || id === null || !isTrainingBatchPaperId(paperId)) {
    return json({ error: "Worker activity not found." }, 404);
  }
  const user = await getGoogleUser().catch(() => undefined);
  if (user === undefined) return json({ error: "JumpServe could not verify your sign-in." }, 503);
  if (!user) return json({ error: "Sign in with Google to view worker activity." }, 401);

  try {
    const activity = await readTrainingBatchActivity(source.bucket, id, paperId);
    return activity ? json(activity, 200) : json({ error: "Worker activity not found." }, 404);
  } catch {
    return json({ error: "Worker activity is temporarily unavailable." }, 503);
  }
}
