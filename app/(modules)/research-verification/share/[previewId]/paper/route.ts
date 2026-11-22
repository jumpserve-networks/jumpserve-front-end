import { requireGoogleUser } from "@/lib/auth";
import { mcpConfig } from "@/lib/jumpserve-mcp-oauth";
import { SHARE_REVIEW_PATH } from "@/lib/jumpserve-mcp-server";
import { assessmentPdfDownload } from "@/lib/jumpserve-mcp-store";
import { isResearchId } from "@/lib/research-experiment-queue";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ previewId: string }> }) {
  const { previewId } = await params;
  if (!mcpConfig() || !isResearchId(previewId)) return new Response(null, { status: 404 });
  const owner = await requireGoogleUser(`${SHARE_REVIEW_PATH}/${previewId}`);
  return assessmentPdfDownload(previewId, owner.id);
}
