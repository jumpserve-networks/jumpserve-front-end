import { NextResponse } from "next/server";
import OpenAI from "openai";
import { isDeepStrictEqual } from "node:util";
import { intakeActor, loadIntake } from "@/lib/paper-intake-server";
import { ExperimentPlanError, loadExperimentPlan } from "@/lib/paper-experiment-plan-server";
import { loadExperimentScripts, prepareExperimentScripts, refreshExperimentScripts, cancelExperimentScripts, experimentScriptsView, reconcileEarlierCommands } from "@/lib/paper-experiment-scripts-server";
import { TERMINAL_TARGET } from "@/lib/paper-terminal-commands";
import { isResearchId } from "@/lib/research-experiment-queue";
import type { TerminalCommandsRecord } from "@/lib/paper-terminal-commands-runner";
import type { ExperimentPlanRecord } from "@/lib/paper-experiment-plan-runner";
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
const failure = (error: unknown) => error instanceof OpenAI.APIError ? json({ error: `Model status could not be checked (HTTP ${error.status ?? "unavailable"}). The saved script request is retained.` }, 503) : json({ error: error instanceof Error ? error.message : "Experiment scripts are unavailable." }, error instanceof ExperimentPlanError ? error.status : 503);
function verifySource(row: TerminalCommandsRecord | null, plan: ExperimentPlanRecord) {
  if (row && (!isDeepStrictEqual(row.source_plan, plan.plan) || !isDeepStrictEqual(row.confirmed_breakdown, plan.confirmed_breakdown))) throw new ExperimentPlanError("The saved scripts belong to an earlier experiment plan. Their original request and response are retained.", 409);
}
async function owned(request: Request, study: unknown, index: unknown, actor?: string) {
  actor ??= await intakeActor(request) ?? undefined;
  if (!actor) throw new ExperimentPlanError("Sign in with Google to generate or view experiment scripts.", 401);
  if (!isResearchId(study) || !Number.isSafeInteger(index) || Number(index) < 1 || Number(index) > 8) throw new ExperimentPlanError("Choose an assessment and experiment.", 400);
  const intake = await loadIntake(study, actor);
  if (!intake) throw new ExperimentPlanError("Private paper assessment not found.", 404);
  const plan = await loadExperimentPlan(study, actor);
  if (intake.status !== "ready" || plan?.status !== "ready" || !plan.plan || Number(index) > plan.plan.experiments.length) throw new ExperimentPlanError("A saved experiment plan is required.", 409);
  return { actor, plan, study, index: Number(index) };
}
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => !["id", "experiment"].includes(key)) || query.getAll("id").length !== 1 || query.getAll("experiment").length !== 1 || !/^[1-8]$/.test(query.get("experiment") ?? "")) throw new ExperimentPlanError("Choose one assessment and experiment.", 400);
    const { actor, plan, study, index } = await owned(request, query.get("id"), Number(query.get("experiment")));
    const row = await loadExperimentScripts(study, actor, index);
    verifySource(row, plan);
    const prior = row ? 0 : await reconcileEarlierCommands(study, actor, index);
    return json(experimentScriptsView(row ? await refreshExperimentScripts(row) : null, study, index, prior));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const verified = await intakeActor(request);
    if (!verified) throw new ExperimentPlanError("Sign in with Google to generate experiment scripts.", 401);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "A JSON request is required." }, 415);
    const raw = await request.text();if (Buffer.byteLength(raw) > 4096) return json({ error: "The script request is too large." }, 413);
    let body;try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON request." }, 400); }
    if (!body || Object.keys(body).sort().join(",") !== "action,experiment_index,study_id,target" || !["generate", "cancel", "cancel_previous"].includes(body.action) || body.target !== TERMINAL_TARGET) return json({ error: "Choose experiment script generation or cancellation for Ubuntu/Debian." }, 400);
    const { actor, plan, study, index } = await owned(request, body.study_id, body.experiment_index, verified);
    const row = await loadExperimentScripts(study, actor, index);
    if (body.action === "generate") verifySource(row, plan);
    if (body.action === "cancel_previous") return json(experimentScriptsView(row, study, index, await reconcileEarlierCommands(study, actor, index, true)));
    if (body.action === "cancel") {
      if (!row) return json({ error: "No shared script request exists." }, 409);
      return json(experimentScriptsView(await cancelExperimentScripts(row), study, index));
    }
    if (row) return json(experimentScriptsView(await refreshExperimentScripts(row), study, index));
    const prior = await reconcileEarlierCommands(study, actor, index);
    if (prior) return json(experimentScriptsView(null, study, index, prior));
    return json(experimentScriptsView(await prepareExperimentScripts(plan, index), study, index));
  } catch (error) { return failure(error); }
}
