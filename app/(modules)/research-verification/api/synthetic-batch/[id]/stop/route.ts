import { getGoogleUser } from "@/lib/auth";
import { readBoundedBody } from "@/lib/jumpserve-mcp-oauth";
import { getConfiguredSiteUrl, PRODUCTION_SITE_ORIGIN } from "@/lib/site-url";
import { getSyntheticBatchConfiguration, readTrainingBatch, requestSyntheticBatchStop } from "@/lib/synthetic-batch-server";
import { isTrainingBatchStoppable, parseTrainingBatchId } from "@/lib/training-batch";

export const runtime = "nodejs";

const json = (value: unknown, status: number) => Response.json(value, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseTrainingBatchId((await params).id);
  const configuration = getSyntheticBatchConfiguration();
  if (id === null || !configuration) return json({ error: "Training batch not found." }, 404);
  if (request.headers.get("origin") !== (getConfiguredSiteUrl() ?? PRODUCTION_SITE_ORIGIN)) {
    return json({ error: "Open JumpServe directly to stop the training batch." }, 403);
  }
  if (new URL(request.url).search ||
      (request.body && (await readBoundedBody(request, 0).catch(() => null)) !== "")) {
    return json({ error: "The batch stop takes no additional parameters." }, 400);
  }

  const user = await getGoogleUser().catch(() => undefined);
  if (user === undefined) return json({ error: "JumpServe could not verify your sign-in." }, 503);
  if (!user) return json({ error: "Sign in with Google to stop the training batch." }, 401);
  if (user.id !== configuration.ownerId) return json({ error: "Only the batch owner can stop it." }, 403);

  const batch = await readTrainingBatch({ kind: "s3", bucket: configuration.bucket }, id, user.id).catch(() => undefined);
  if (batch === undefined) return json({ error: "JumpServe could not verify the batch status." }, 503);
  if (!batch) return json({ error: "Training batch not found." }, 404);
  if (!isTrainingBatchStoppable(batch.status)) return json({ error: "This batch is not currently running." }, 409);
  if (!batch.canStop) return json({ error: "Only the batch owner can stop it." }, 403);

  try {
    await requestSyntheticBatchStop(configuration, id);
    return json({ status: "requested" }, 202);
  } catch {
    return json({ error: "JumpServe could not confirm the stop request. Check the batch status before retrying." }, 502);
  }
}
