import "server-only";
import { getResearchSnapshot } from "@/lib/research-workflow-server";
import { measurementsCsv } from "@/lib/research-workflow";
import { researchExportPath, researchStudyKind, type ResearchStudyKind } from "@/lib/research-pathways";

export async function publishedStudyExport(request: Request, studyId: string, kind: ResearchStudyKind) {
  const result = await getResearchSnapshot(studyId);
  if (result.status !== "available") return Response.json({ error: result.reason }, { status: result.status === "not-found" ? 404 : 503 });
  const url = new URL(request.url);
  const actualKind = researchStudyKind(result.data.study);
  if (actualKind !== kind) return new Response(null, { status: 308, headers: { Location: researchExportPath(actualKind, studyId) + url.search } });
  const format = url.searchParams.get("format");
  if (format && !["csv", "json"].includes(format)) return Response.json({ error: "Use json or csv." }, { status: 400 });
  const headers = { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename=research-${studyId}.${format === "csv" ? "csv" : "json"}` };
  return format === "csv" ? new Response(measurementsCsv(result.data), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } }) : Response.json(result.data, { headers });
}
