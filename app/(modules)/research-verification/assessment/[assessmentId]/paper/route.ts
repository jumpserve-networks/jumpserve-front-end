import { assessmentPdfDownload } from "@/lib/jumpserve-mcp-store";
import { isResearchId } from "@/lib/research-experiment-queue";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;
  if (!isResearchId(assessmentId)) return new Response(null, { status: 404 });
  return assessmentPdfDownload(assessmentId);
}
