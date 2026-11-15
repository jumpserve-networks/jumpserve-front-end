import { NextResponse } from "next/server";
import { validateProgressIds } from "@/lib/assessment-wizard-progress";
import { readAssessmentWizardProgress } from "@/lib/assessment-wizard-progress-server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const ids = query.getAll("id");
  try {
    if ([...query.keys()].some(key => key !== "id")) throw new Error("Supply only assessment IDs.");
    validateProgressIds(ids);
  } catch { return json({ error: "Supply between one and ten unique assessment IDs." }, 400); }
  try { return json(await readAssessmentWizardProgress(ids)); }
  catch { return json({ error: "Assessment steps are temporarily unavailable." }, 503); }
}
