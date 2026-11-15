import { studyResultsExport } from "@/lib/research-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ assessmentId: string }> }) {
  return studyResultsExport(request, (await params).assessmentId, "paper");
}
