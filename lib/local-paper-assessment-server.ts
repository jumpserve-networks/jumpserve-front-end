import "server-only";
import { intakeConfigured, intakeDatabase } from "./paper-intake-server";
import { readWithAssessmentDeletion } from "./assessment-visibility";
import { validateLocalPaperAssessment } from "./local-paper-assessment";
import { shareLocalPaperAssessment } from "./shared-local-paper-assessment";

/** Read-only adapter over immutable review history; never alters API workflows. */
export async function loadLocalPaperAssessment(study: string, actor?: string | null) {
  const db = await intakeDatabase();
  const ownership = await db.from("research_study_owners").select("owner_id").eq("study_id", study).maybeSingle();
  if (ownership.error) throw new Error("Local assessment ownership could not be checked.");
  if (!ownership.data || actor && ownership.data.owner_id !== actor) return null;
  const active = await readWithAssessmentDeletion(filterDeleted => {
    const query = db.from("research_studies").select("id").eq("id", study);
    return (filterDeleted ? query.is("deleted_at", null) : query).maybeSingle();
  });
  if (active.error) throw new Error("Local assessment availability could not be checked.");
  if (!active.data) return null;
  const review = await db.from("research_paper_reviews").select("metadata,revision,status").eq("study_id", study).maybeSingle();
  if (review.error) throw new Error("Local assessment evidence could not be loaded.");
  const metadata = review.data?.metadata;
  if (!metadata?.local_codex_assessment || review.data?.status !== "confirmed") return null;
  // Existing history records the exact imported bundle, including hashes and origin.
  const bundle = validateLocalPaperAssessment(metadata.local_codex_assessment, study);
  if (metadata.local_codex_assessment_owner !== ownership.data.owner_id) throw new Error("Local assessment owner does not match its retained import.");
  return { bundle, owner: ownership.data.owner_id as string };
}

/** A failed optional local read must not hide the existing public paper header. */
export async function loadSharedLocalPaperAssessment(study: string) {
  try {
    if (!await intakeConfigured()) return { status: "absent" as const };
    const local = await loadLocalPaperAssessment(study);
    return local ? { status: "available" as const, owner: local.owner, value: shareLocalPaperAssessment(local.bundle) } : { status: "absent" as const };
  } catch { return { status: "unavailable" as const }; }
}
