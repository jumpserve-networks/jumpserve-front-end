import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireGoogleUser } from "@/lib/auth";
import { mcpConfig } from "@/lib/jumpserve-mcp-oauth";
import { SHARE_REVIEW_PATH } from "@/lib/jumpserve-mcp-server";
import { approveAssessment, readAssessmentPreview } from "@/lib/jumpserve-mcp-store";
import { isResearchId } from "@/lib/research-experiment-queue";
import { researchAssessmentPath } from "@/lib/research-pathways";
import { Button } from "@/app/components/ui/button";
import { SkillAssessment } from "@/app/components/research-workflow/skill-assessment";

async function approve(id: string, hash: string) {
  "use server";
  if (!mcpConfig() || !isResearchId(id) || !/^[a-f0-9]{64}$/.test(hash)) notFound();
  const path = `${SHARE_REVIEW_PATH}/${id}`;
  const user = await requireGoogleUser(path);
  if (!await approveAssessment(user.id, id, hash)) notFound();
  redirect(path);
}

export const metadata = { title: "Review shared assessment", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SharePreviewPage({ params }: { params: Promise<{ previewId: string }> }) {
  const { previewId } = await params;
  if (!mcpConfig() || !isResearchId(previewId)) notFound();
  const user = await requireGoogleUser(`${SHARE_REVIEW_PATH}/${previewId}`);
  const preview = await readAssessmentPreview(user.id, previewId);
  if (!preview) notFound();
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
    <div className="content-panel space-y-3 rounded-xl border p-5">
      {preview.studyId ? <Link className="text-primary underline" href={researchAssessmentPath(preview.studyId)}>View the public assessment</Link>
        : preview.approved ? <p role="status">Approved. Return to Claude Code or Codex and tell it to finish sharing.</p>
          : <>
            <p>Review the fields below. Approve this copy to let your connected client share it publicly.</p>
            <form action={approve.bind(null, previewId, preview.hash)}>
              <Button type="submit">Approve public sharing</Button>
            </form>
          </>}
    </div>
    <SkillAssessment bundle={preview.bundle} />
  </main>;
}
