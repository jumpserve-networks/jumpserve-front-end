import { NextResponse } from "next/server";
import { intakeActor, loadIntake } from "@/lib/paper-intake-server";
import { cancelPlan, confirmPlan, experimentPlanView, ExperimentPlanError, loadExperimentPlan, refreshPlan } from "@/lib/paper-experiment-plan-server";
import { isResearchId } from "@/lib/research-experiment-queue";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
const failure = (error: unknown) => json({ error: error instanceof Error ? error.message : "Experiment planning is unavailable." }, error instanceof ExperimentPlanError ? error.status : 503);
async function owned(request: Request, id: unknown, verifiedActor?: string) {
  const actor = verifiedActor ?? await intakeActor(request);
  if (!actor) throw new ExperimentPlanError("Sign in with Google to review and plan your paper’s experiments.", 401);
  if (!isResearchId(id)) throw new ExperimentPlanError("A valid assessment ID is required.", 400);
  const intake = await loadIntake(id, actor);
  if (!intake) throw new ExperimentPlanError("Private paper assessment not found.", 404);
  if (intake.status !== "ready") throw new ExperimentPlanError("Wait for the four-section paper breakdown before confirming phase one.", 409);
  return { actor, intake };
}
export async function GET(request: Request) {
  try {
    const { actor, intake } = await owned(request, new URL(request.url).searchParams.get("id"));
    const row = await loadExperimentPlan(intake.study_id, actor);
    return json(experimentPlanView(row ? await refreshPlan(row) : null, intake));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await intakeActor(request);
    if (!actor) return json({ error: "Sign in with Google to confirm phase one." }, 401);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "A JSON request is required." }, 415);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 80_000) return json({ error: "The reviewed paper request is too large." }, 413);
    let body; try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON request." }, 400); }
    if (!body || !["confirm", "cancel"].includes(body.action)) return json({ error: "Unknown experiment planning operation." }, 400);
    const { intake } = await owned(request, body.study_id, actor);
    const keys = Object.keys(body).sort().join(",");
    if (body.action === "confirm") {
      if (keys !== "action,intake_revision,sections,study_id" || !Number.isSafeInteger(body.intake_revision) || body.intake_revision < 1) return json({ error: "Confirm a specific revision of all four sections." }, 400);
      return json(experimentPlanView(await confirmPlan(intake, body.intake_revision, body.sections), intake));
    }
    if (keys !== "action,study_id") return json({ error: "Supply only the assessment identity for cancellation." }, 400);
    const row = await loadExperimentPlan(intake.study_id, actor);
    if (!row) return json({ error: "No planning request has been confirmed." }, 409);
    return json(experimentPlanView(await cancelPlan(row), intake));
  } catch (error) { return failure(error); }
}
