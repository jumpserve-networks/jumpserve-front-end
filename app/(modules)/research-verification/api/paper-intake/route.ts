import { NextResponse } from "next/server";
import { intakeActor, intakeConfigured, intakeDatabase, intakeView, loadIntake, ownerIntakes, prepareIntake, refreshIntake, reserveIntake, cancelIntake } from "@/lib/paper-intake-server";
import { isResearchId } from "@/lib/research-experiment-queue";
import { PAPER_INTAKE_VERSION } from "@/lib/paper-intake";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
const failure = (error: unknown) => json({ error: error instanceof Error ? error.message : "Paper preparation is unavailable." }, 503);

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    if (query.get("capabilities") === "1") return json({ paper_intake: { version: PAPER_INTAKE_VERSION, enabled: await intakeConfigured() }, paper_uploads: { version: "research-paper-upload-v2", review_version: "research-paper-review-v1", confirmation_required: true, maximum_bytes: 10_000_000 } });
    const actor = await intakeActor(request);
    if (query.get("mine") === "1") {
      if (!actor) return json({ error: "Sign in with Google to view your papers." }, 401);
      if (!await intakeConfigured()) return json({ error: "The server-side paper database connection is not configured." }, 424);
      return json(await ownerIntakes(actor));
    }
    const id = query.get("id");
    if (!isResearchId(id)) return json({ error: "A valid assessment ID is required." }, 400);
    if (!await intakeConfigured()) return json({ error: "This paper uses the existing assessment service." }, 404);
    const row = await loadIntake(id);
    if (!row) return json({ error: "This paper uses the existing assessment service." }, 404);
    // Public reads expose status only and cannot trigger provider operations.
    const current = actor === row.owner_id ? await refreshIntake(row) : row;
    return json(await intakeView(current, actor));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await intakeActor(request);
    if (!actor) return json({ error: "Sign in with Google to prepare or cancel a paper." }, 401);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "A JSON request is required." }, 415);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 4096) return json({ error: "Paper request is too large." }, 413);
    let body; try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON request." }, 400); }
    if (!body || !isResearchId(body.request_id)) return json({ error: "A valid assessment ID is required." }, 400);
    if (body.action === "reserve") {
      if (Object.keys(body).sort().join(",") !== "action,byte_count,filename,request_id,sha256") return json({ error: "Supply only the original PDF identity." }, 400);
      return json(await reserveIntake(actor, body.request_id, { filename: body.filename, sha256: body.sha256, byte_count: body.byte_count }));
    }
    if (!["prepare", "cancel", "resume"].includes(body.action) || Object.keys(body).sort().join(",") !== "action,request_id") return json({ error: "Unknown paper preparation operation." }, 400);
    let row = await loadIntake(body.request_id, actor);
    if (!row && body.action === "resume") {
      const { data, error } = await (await intakeDatabase()).from("research_paper_uploads").select("paper").eq("id", body.request_id).eq("owner_id", actor).maybeSingle();
      if (error || !data) return json({ error: "Private paper upload not found." }, 404);
      await reserveIntake(actor, body.request_id, data.paper.paper_upload);
      row = await loadIntake(body.request_id, actor);
    }
    if (!row) return json({ error: "Private paper preparation not found." }, 404);
    const current = body.action === "cancel" ? await cancelIntake(row) : await prepareIntake(row);
    return json(await intakeView(current, actor));
  } catch (error) { return failure(error); }
}
