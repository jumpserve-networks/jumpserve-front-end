import { getGoogleUser } from "@/lib/auth";
import { getConfiguredSiteUrl, PRODUCTION_SITE_ORIGIN } from "@/lib/site-url";
import { getSyntheticBatchConfiguration, requestSyntheticBatchStart } from "@/lib/synthetic-batch-server";

export const runtime = "nodejs";

const json = (value: unknown, status: number) => Response.json(value, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request) {
  const configuration = getSyntheticBatchConfiguration();
  if (!configuration) return json({ error: "The synthetic batch control is unavailable." }, 404);
  if (request.headers.get("origin") !== (getConfiguredSiteUrl() ?? PRODUCTION_SITE_ORIGIN)) {
    return json({ error: "Open JumpServe directly to start the synthetic batch." }, 403);
  }
  if (request.body !== null || new URL(request.url).search) {
    return json({ error: "The synthetic batch start takes no parameters." }, 400);
  }

  const user = await getGoogleUser().catch(() => undefined);
  if (user === undefined) return json({ error: "JumpServe could not verify your sign-in." }, 503);
  if (!user) return json({ error: "Sign in with Google to start the synthetic batch." }, 401);
  if (user.id !== configuration.ownerId) return json({ error: "Only the batch owner can start it." }, 403);

  try {
    await requestSyntheticBatchStart(configuration.instanceId);
    return json({ status: "requested" }, 202);
  } catch {
    return json({ error: "AWS did not confirm the batch start request." }, 502);
  }
}
