import { NextResponse } from "next/server";
import OpenAI from "openai";
import { intakeActor, loadIntake } from "@/lib/paper-intake-server";
import { ExperimentPlanError, loadExperimentPlan } from "@/lib/paper-experiment-plan-server";
import { loadStepCommands, stepCommandsList, stepCommandsView, prepareStepCommands, refreshStepCommands, cancelStepCommands } from "@/lib/paper-step-commands-server";
import { selectedCommandStep } from "@/lib/paper-step-commands";
import { TERMINAL_TARGET } from "@/lib/paper-terminal-commands";
import { isResearchId } from "@/lib/research-experiment-queue";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
const failure = (error: unknown) => error instanceof OpenAI.APIError ? json({ error: `Model status could not be checked (HTTP ${error.status ?? "unavailable"}). The original step request is retained.` }, 503) : json({ error: error instanceof Error ? error.message : "Step commands are unavailable." }, error instanceof ExperimentPlanError ? error.status : 503);
async function owned(request: Request, study: unknown, index: unknown, ref: unknown, verifiedActor?: string) {
  const actor = verifiedActor ?? await intakeActor(request);
  if (!actor) throw new ExperimentPlanError("Sign in with Google to generate or view step commands.", 401);
  if (!isResearchId(study) || !Number.isSafeInteger(index) || Number(index) < 1 || Number(index) > 8 || ref !== null && (typeof ref !== "string" || !/^[1-8]\.[1-9][0-9]?(?:\.[1-8])?$/.test(ref))) throw new ExperimentPlanError("Choose an assessment and numbered step.", 400);
  const intake = await loadIntake(study, actor);
  if (!intake) throw new ExperimentPlanError("Private paper assessment not found.", 404);
  const plan = await loadExperimentPlan(study, actor);
  if (intake.status !== "ready" || plan?.status !== "ready" || !plan.plan || Number(index) > plan.plan.experiments.length) throw new ExperimentPlanError("A saved experiment plan is required.", 409);
  if (ref !== null) { try { selectedCommandStep(plan.plan, Number(index), ref as string); } catch { throw new ExperimentPlanError("Choose an existing numbered experiment step.", 400); } }
  return { actor, plan, study, index: Number(index), ref: ref as string | null };
}
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => !["id", "experiment", "step"].includes(key)) || query.getAll("id").length !== 1 || query.getAll("experiment").length !== 1 || query.getAll("step").length > 1 || !/^[1-8]$/.test(query.get("experiment") ?? "")) return json({ error: "Choose one assessment, experiment and optional numbered step." }, 400);
    const { plan, study, index, ref } = await owned(request, query.get("id"), Number(query.get("experiment")), query.get("step"));
    if (ref === null) return json(await stepCommandsList(plan, index));
    const row = await loadStepCommands(plan, index, ref);
    return json(stepCommandsView(row ? await refreshStepCommands(row) : null, study, index, ref));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await intakeActor(request);
    if (!actor) return json({ error: "Sign in with Google to generate step commands." }, 401);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "A JSON request is required." }, 415);
    const raw = await request.text();if (Buffer.byteLength(raw) > 4096) return json({ error: "The step request is too large." }, 413);
    let body;try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON request." }, 400); }
    if (!body || Object.keys(body).sort().join(",") !== "action,action_ref,experiment_index,study_id,target" || !["generate", "cancel"].includes(body.action) || body.target !== TERMINAL_TARGET || typeof body.action_ref !== "string") return json({ error: "Choose generation or cancellation for one numbered step." }, 400);
    const { plan, study, index, ref } = await owned(request, body.study_id, body.experiment_index, body.action_ref, actor);
    if (body.action === "generate") return json(stepCommandsView(await prepareStepCommands(plan, index, ref!), study, index, ref!));
    const row = await loadStepCommands(plan, index, ref!);
    if (!row) return json({ error: "No command request exists for this step." }, 404);
    return json(stepCommandsView(await cancelStepCommands(row), study, index, ref!));
  } catch (error) { return failure(error); }
}
