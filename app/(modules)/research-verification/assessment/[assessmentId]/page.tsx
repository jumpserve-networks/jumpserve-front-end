import { notFound } from "next/navigation";
import { getGoogleUser, requireGoogleUser } from "@/lib/auth";
import { AssessmentDetail } from "@/app/components/research-workflow/assessment-detail";
import { PaperReviewPanel } from "@/app/components/research-workflow/paper-review";
import { PaperAssessment } from "@/app/components/research-workflow/paper-assessment";
import { isResearchId } from "@/lib/research-experiment-queue";
import { researchAssessmentPath, researchSearchSuffix } from "@/lib/research-pathways";
import { loadSharedLocalPaperAssessment } from "@/lib/local-paper-assessment-server";
import { SharedLocalPaperAssessment } from "@/app/components/research-workflow/shared-local-paper-assessment";
import { SkillAssessment } from "@/app/components/research-workflow/skill-assessment";
import { mcpConfig } from "@/lib/jumpserve-mcp-oauth";
import { isSharedSkillAssessmentOwner, readAssessmentPreview, readAssessmentVerifierResults, readSharedSkillAssessment } from "@/lib/jumpserve-mcp-store";
import { decodeAssessmentCursor } from "@/lib/research-assessment-cursor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessment" };

export default async function AssessmentPage({ params, searchParams }: { params: Promise<{ assessmentId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { assessmentId } = await params;
  if (!isResearchId(assessmentId)) notFound();
  const path = researchAssessmentPath(assessmentId);
  const query = (await searchParams) ?? {};
  const { job, gap, run } = query;
  if ([job, gap, run].some(value => value !== undefined && !isResearchId(value)) || (run && !gap)) notFound();
  if (gap) await requireGoogleUser(path + researchSearchSuffix(query));
  const connector = !gap ? mcpConfig() : null;
  const [sharedSkill, user] = await Promise.all([
    gap ? null : readSharedSkillAssessment(assessmentId).catch(() => null),
    connector ? getGoogleUser().catch(() => null) : undefined,
  ]);
  const preview = !sharedSkill && user ? await readAssessmentPreview(user.id, assessmentId).catch(() => null) : null;
  const privateSkill = preview && !preview.studyId ? preview : null;
  const bundle = sharedSkill ?? privateSkill?.bundle;
  if (bundle) {
    const owner = user && (sharedSkill ? await isSharedSkillAssessmentOwner(user.id, assessmentId).catch(() => false) : privateSkill);
    const before = query.step === "verifier-results" && typeof query.verifier_before === "string"
      ? decodeAssessmentCursor(query.verifier_before) ?? undefined : undefined;
    const verifier = connector && owner && user ? {
      assessmentId,
      connectionsUrl: `${connector.issuer}/oauth/jumpserve/connections`,
      ...(before ? { viewingOlderResults: true } : {}),
      results: query.step === "verifier-results" ? await readAssessmentVerifierResults(user.id, assessmentId, before)
        .catch(() => "unavailable" as const) : undefined,
    } : undefined;
    return <main className={sharedSkill ? "mx-auto max-w-6xl px-4 py-6" : "mx-auto max-w-5xl px-4 py-8"} data-testid="assessment-detail">
      {privateSkill ? <meta name="robots" content="noindex, nofollow" /> : null}
      <SkillAssessment bundle={bundle} path={path} query={query} pdfReady={privateSkill?.pdfReady} verifier={verifier} />
    </main>;
  }
  const local = gap ? { status: "absent" as const } : await loadSharedLocalPaperAssessment(assessmentId);
  if (local.status === "available" && (user === undefined ? await getGoogleUser() : user)?.id !== local.owner) return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6" data-testid="assessment-detail">
    <AssessmentDetail assessmentId={assessmentId} embedded />
    <SharedLocalPaperAssessment value={local.value} />
  </main>;
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6" data-testid="assessment-detail">
    {local.status === "unavailable" ? <p role="alert" className="text-sm text-destructive">Shared local assessment details are temporarily unavailable.</p> : null}
    <PaperAssessment key={assessmentId} assessmentId={assessmentId} allowResume wizard embedded ownerOnly header={<AssessmentDetail assessmentId={assessmentId} gapId={gap as string | undefined} launchId={run as string | undefined} embedded />}><PaperReviewPanel assessmentId={assessmentId} /></PaperAssessment>
  </main>;
}
