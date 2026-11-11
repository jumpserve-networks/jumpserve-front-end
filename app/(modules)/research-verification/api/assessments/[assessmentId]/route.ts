import { NextResponse } from "next/server";
import { intakeActor, intakeDatabase } from "@/lib/paper-intake-server";
import { isResearchId } from "@/lib/research-experiment-queue";
import { readWithAssessmentDeletion } from "@/lib/assessment-visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
type Context = { params: Promise<{ assessmentId: string }> };

async function owned(request: Request, context: Context) {
  const actor = await intakeActor(request);
  if (!actor) return { response: json({ error: "Sign in with Google to delete your assessments." }, 401) };
  const { assessmentId: id } = await context.params;
  if (!isResearchId(id)) return { response: json({ error: "A valid assessment ID is required." }, 400) };
  const db = await intakeDatabase();
  const { data, error } = await db.from("research_study_owners").select("study_id").eq("study_id", id).eq("owner_id", actor).maybeSingle();
  if (error) throw new Error("Assessment ownership could not be checked.");
  if (!data) return { response: json({ error: "Assessment not found." }, 404) };
  return { actor, id, db };
}

export async function GET(request: Request, context: Context) {
  try {
    const result = await owned(request, context);
    if (result.response) return result.response;
    const { data, error } = await readWithAssessmentDeletion(filterDeleted => {
      const query = result.db.from("research_studies").select("id").eq("id", result.id).eq("study_kind", "paper");
      return (filterDeleted ? query.is("deleted_at", null) : query).maybeSingle();
    });
    if (error) throw new Error("Assessment availability could not be checked.");
    return data ? json({ id: result.id, owner: true }) : json({ error: "Assessment not found." }, 404);
  } catch { return json({ error: "Assessment ownership is temporarily unavailable." }, 503); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const result = await owned(request, context);
    if (result.response) return result.response;
    const { data, error } = await result.db.rpc("research_delete_assessment", { p_actor: result.actor, p_study: result.id });
    if (error) {
      if (error.code === "PGRST202") return json({ error: "Assessment deletion is not enabled in this database yet." }, 424);
      if (error.code === "P0002") return json({ error: "Assessment not found." }, 404);
      if (error.code === "55000") return json({ error: "Stop running work and reconcile pending model calls before deleting this assessment." }, 409);
      return json({ error: "Assessment deletion could not be confirmed. Refresh the list before trying again." }, 503);
    }
    if (data?.id !== result.id || data?.deleted !== true) throw new Error("Deletion was not confirmed.");
    return json(data);
  } catch { return json({ error: "Assessment deletion is temporarily unavailable. Refresh the list before trying again." }, 503); }
}
