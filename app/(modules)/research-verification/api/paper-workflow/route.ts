import { NextResponse } from "next/server";
import { intakeActor } from "@/lib/paper-intake-server";
import { ownerPaperWork } from "@/lib/paper-work-server";
import { ExperimentPlanError } from "@/lib/paper-experiment-plan-server";
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
export async function GET(request: Request) {
  try {
    const actor = await intakeActor(request);
    if (!actor) return json({ error: "Sign in with Google to check background paper work." }, 401);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== "cursor") || params.getAll("cursor").length > 1 || !/^(0|[1-9]\d{0,3})$/.test(params.get("cursor") ?? "0") || Number(params.get("cursor") ?? 0) > 9000) return json({ error: "Choose a valid background status cursor." }, 400);
    return json(await ownerPaperWork(actor, Number(params.get("cursor") ?? 0)));
  } catch (error) { return json({ error: error instanceof ExperimentPlanError ? error.message : "Background paper status is temporarily unavailable. Saved work is retained." }, error instanceof ExperimentPlanError ? error.status : 503); }
}
