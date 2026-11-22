import { getGoogleUser } from "@/lib/auth";
import { readPrivateAssessmentCatalog } from "@/lib/jumpserve-mcp-store";
import { decodeAssessmentCursor } from "@/lib/research-assessment-cursor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const values = query.getAll("before");
  const before = values.length ? decodeAssessmentCursor(values[0]) : undefined;
  if (values.length > 1 || before === null || [...query.keys()].some(key => key !== "before")) {
    return json({ error: "The assessment page link is invalid." }, 400);
  }
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  try {
    const owner = token ? await getGoogleUser(token) : null;
    if (!owner) return json({ error: "Sign in to view your assessments." }, 401);
    return json(await readPrivateAssessmentCatalog(owner.id, before));
  } catch {
    return json({ error: "Private assessments are temporarily unavailable." }, 503);
  }
}
