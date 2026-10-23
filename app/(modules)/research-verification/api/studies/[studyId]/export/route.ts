import { permanentRedirect } from "next/navigation";
import { researchExportPath } from "@/lib/research-pathways";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ studyId: string }> }) {
  permanentRedirect(researchExportPath("paper", (await params).studyId) + new URL(request.url).search);
}
