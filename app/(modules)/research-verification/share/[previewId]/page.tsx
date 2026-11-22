import { notFound, redirect } from "next/navigation";
import { requireGoogleUser } from "@/lib/auth";
import { mcpConfig } from "@/lib/jumpserve-mcp-oauth";
import { SHARE_REVIEW_PATH } from "@/lib/jumpserve-mcp-server";
import { approveAssessment, readAssessmentPreview, submitAssessment } from "@/lib/jumpserve-mcp-store";
import { isResearchId } from "@/lib/research-experiment-queue";
import { researchAssessmentPath, researchSearchSuffix } from "@/lib/research-pathways";
import { Button } from "@/app/components/ui/button";
import { SkillAssessment } from "@/app/components/research-workflow/skill-assessment";

async function share(id: string, hash: string) {
  "use server";
  if (!mcpConfig() || !isResearchId(id) || !/^[a-f0-9]{64}$/.test(hash)) notFound();
  const path = `${SHARE_REVIEW_PATH}/${id}`;
  const user = await requireGoogleUser(path);
  if (!await approveAssessment(user.id, id, hash)) {
    const preview = await readAssessmentPreview(user.id, id);
    if (preview?.hash !== hash || !preview.studyId) notFound();
    redirect(researchAssessmentPath(preview.studyId));
  }
  let studyId: string;
  try {
    studyId = await submitAssessment(user.id, id);
  } catch {
    // Reload the same preview to reconcile a submission that may have completed.
    redirect(path);
  }
  redirect(researchAssessmentPath(studyId));
}

export const metadata = { title: "Review shared assessment", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SharePreviewPage({ params, searchParams }: { params: Promise<{ previewId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { previewId } = await params;
  if (!mcpConfig() || !isResearchId(previewId)) notFound();
  const path = `${SHARE_REVIEW_PATH}/${previewId}`;
  const query = (await searchParams) ?? {};
  const user = await requireGoogleUser(`${path}${researchSearchSuffix(query)}`);
  const preview = await readAssessmentPreview(user.id, previewId);
  if (!preview) notFound();
  if (preview.studyId) redirect(researchAssessmentPath(preview.studyId));
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
    <div className="content-panel space-y-3 rounded-xl border p-5">
      {preview.approved
        ? <p role="status">This copy is approved. You can finish sharing it publicly here.</p>
        : <p>Review Steps 2–4 of this private assessment before approving this exact copy for public sharing.</p>}
      <form action={share.bind(null, previewId, preview.hash)}>
        <Button type="submit">{preview.approved ? "Share approved assessment" : "Approve public sharing"}</Button>
      </form>
    </div>
    <SkillAssessment bundle={preview.bundle} path={path} query={query} />
  </main>;
}
