import { getGoogleUser } from "@/lib/auth";
import { mcpConfig } from "@/lib/jumpserve-mcp-oauth";
import { assessmentPdfDownload } from "@/lib/jumpserve-mcp-store";
import { isResearchId } from "@/lib/research-experiment-queue";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;
  if (!isResearchId(assessmentId)) return new Response(null, { status: 404 });
  const shared = await assessmentPdfDownload(assessmentId);
  if (shared.status !== 404 || !mcpConfig()) return shared;
  const owner = await getGoogleUser();
  return owner ? assessmentPdfDownload(assessmentId, owner.id) : shared;
}
