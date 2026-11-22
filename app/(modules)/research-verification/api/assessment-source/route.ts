import { getGoogleUser, requireGoogleUser } from "@/lib/auth";
import { BoundedBodyError, readBoundedBody } from "@/lib/jumpserve-mcp-oauth";
import { localAssessmentSourceDownload, readLocalAssessmentSource, reserveLocalAssessmentSource } from "@/lib/jumpserve-mcp-store";
import { isPaperSha256, localAssessmentSourcePage } from "@/lib/local-assessment-source";
import { isResearchId } from "@/lib/research-experiment-queue";
import { PAPER_UPLOAD_MAX_BYTES } from "@/lib/research-paper-upload";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const failure = (error: string, status: number) => Response.json({ error }, { status, headers });

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  const owner = token ? await getGoogleUser(token) : null;
  if (!owner) return failure("Sign in with Google to upload a paper.", 401);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return failure("A JSON request is required.", 415);
  }

  let body;
  try {
    body = JSON.parse(await readBoundedBody(request, 512));
  } catch (error) {
    return failure("Invalid PDF upload request.", error instanceof BoundedBodyError ? error.status : 400);
  }
  if (!body || Object.keys(body).sort().join(",") !== "action,assessment_id,byte_count,sha256" || !isResearchId(body.assessment_id) ||
      !isPaperSha256(body.sha256) || !Number.isInteger(body.byte_count) ||
      body.byte_count < 1 || body.byte_count > PAPER_UPLOAD_MAX_BYTES) {
    return failure("A valid assessment ID and PDF metadata are required.", 400);
  }

  const { action, assessment_id, sha256, byte_count } = body;
  try {
    if (action === "reserve") {
      const ticket = await reserveLocalAssessmentSource(owner.id, assessment_id, { sha256, byte_count });
      return ticket ? Response.json(ticket, { headers }) : failure("This assessment ID is unavailable for the selected PDF.", 409);
    }
    if (action === "verify") {
      const source = await readLocalAssessmentSource(owner.id, assessment_id);
      return source && source.sha256 === sha256 && source.byte_count === byte_count ? Response.json({ status: "ready" }, { headers })
        : failure("JumpServe could not verify the uploaded PDF. Retry with the same file.", 404);
    }
    return failure("Unknown PDF upload operation.", 400);
  } catch {
    return failure("Private PDF storage is temporarily unavailable. Try again.", 503);
  }
}

export async function GET(request: Request) {
  const assessmentId = new URL(request.url).searchParams.get("assessment_id");
  if (!isResearchId(assessmentId)) return failure("A valid assessment ID is required.", 400);
  const owner = await requireGoogleUser(localAssessmentSourcePage(assessmentId));
  try {
    const url = await localAssessmentSourceDownload(owner.id, assessmentId);
    return url ? new Response(null, { status: 303, headers: { ...headers, Location: url } })
      : failure("Private PDF not found.", 404);
  } catch {
    return failure("Private PDF storage is temporarily unavailable. Try again.", 503);
  }
}
