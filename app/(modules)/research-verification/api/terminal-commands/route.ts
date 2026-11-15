import { NextResponse } from "next/server";
import OpenAI from "openai";
import { intakeActor, loadIntake } from "@/lib/paper-intake-server";
import { ExperimentPlanError, loadExperimentPlan } from "@/lib/paper-experiment-plan-server";
import { loadTerminalCommands, prepareTerminalCommands, refreshSavedTerminalCommands, cancelSavedTerminalCommands, terminalCommandsView } from "@/lib/paper-terminal-commands-server";
import { TERMINAL_TARGET } from "@/lib/paper-terminal-commands";
import { isResearchId } from "@/lib/research-experiment-queue";
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
const failure = (error: unknown) => error instanceof OpenAI.APIError
  ? json({ error: `Model status could not be checked (HTTP ${error.status ?? "unavailable"}). The saved command request is retained.` }, 503)
  : json({ error: error instanceof Error ? error.message : "Terminal commands are unavailable." }, error instanceof ExperimentPlanError ? error.status : 503);
async function owned(request: Request, study: unknown, index: unknown, verifiedActor?: string) {
  const actor = verifiedActor ?? await intakeActor(request);
  if (!actor) throw new ExperimentPlanError("Sign in with Google to generate or view terminal commands.", 401);
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
    const { actor, study, index } = await owned(request, query.get("id"), Number(query.get("experiment")));
    const row = await loadTerminalCommands(study, actor, index);
    return json(terminalCommandsView(row ? await refreshSavedTerminalCommands(row) : null, study, index));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    // Authentication precedes body parsing and every generation/cancellation write.
    const verifiedActor = await intakeActor(request);
    if (!verifiedActor) throw new ExperimentPlanError("Sign in with Google to generate terminal commands.", 401);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "A JSON request is required." }, 415);
    const raw = await request.text();if (Buffer.byteLength(raw) > 4096) return json({ error: "The command request is too large." }, 413);
    let body;try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON request." }, 400); }
    if (!body || Object.keys(body).sort().join(",") !== "action,experiment_index,study_id,target" || !["generate", "cancel"].includes(body.action) || body.target !== TERMINAL_TARGET) return json({ error: "Choose terminal command generation or cancellation for Ubuntu/Debian." }, 400);
    const { actor, plan, study, index } = await owned(request, body.study_id, body.experiment_index, verifiedActor);
    if (body.action === "generate") return json(terminalCommandsView(await prepareTerminalCommands(plan, index), study, index));
    const row = await loadTerminalCommands(study, actor, index);if (!row) return json({ error: "No terminal command request exists." }, 409);
    return json(terminalCommandsView(await cancelSavedTerminalCommands(row), study, index));
  } catch (error) { return failure(error); }
}
