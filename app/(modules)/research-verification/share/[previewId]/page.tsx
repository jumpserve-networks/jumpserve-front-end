import { notFound, redirect } from "next/navigation";
import { requireGoogleUser } from "@/lib/auth";
import { mcpConfig } from "@/lib/jumpserve-mcp-oauth";
import { SHARE_REVIEW_PATH } from "@/lib/jumpserve-mcp-server";
import { approveAssessment, readAssessmentPreview, submitAssessment } from "@/lib/jumpserve-mcp-store";
import { isResearchId } from "@/lib/research-experiment-queue";
import { researchAssessmentPath, researchSearchSuffix } from "@/lib/research-pathways";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
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

export const metadata = { title: "Private assessment", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SharePreviewPage({ params, searchParams }: { params: Promise<{ previewId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { previewId } = await params;
  if (!mcpConfig() || !isResearchId(previewId)) notFound();
  const path = `${SHARE_REVIEW_PATH}/${previewId}`;
  const query = (await searchParams) ?? {};
  const user = await requireGoogleUser(`${path}${researchSearchSuffix(query)}`);
  const preview = await readAssessmentPreview(user.id, previewId);
  if (!preview) notFound();
  if (preview.studyId) redirect(`${researchAssessmentPath(preview.studyId)}${researchSearchSuffix(query)}`);
  const includesPdf = preview.bundle.paper.pdf_copy;
  const canShare = preview.complete && (!includesPdf || preview.pdfReady);
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
    <div className="content-panel space-y-3 rounded-xl border p-5">
      {canShare ? <>
        <Badge variant="secondary">Private</Badge>
        {preview.approved
          ? <p role="status">This assessment is approved for public sharing. You can finish sharing it here.</p>
          : <p>This assessment stays private until you choose to share it publicly.</p>}
        {includesPdf ? <p>Public sharing includes the attached source PDF.</p> : null}
        <form action={share.bind(null, previewId, preview.hash)}>
          <Button type="submit">{preview.approved ? "Finish sharing publicly" : "Share publicly"}</Button>
        </form>
      </> : <p role="status">The source PDF is unavailable for public sharing.</p>}
    </div>
    <SkillAssessment bundle={preview.bundle} path={path} query={query} pdfReady={preview.pdfReady} />
  </main>;
}
