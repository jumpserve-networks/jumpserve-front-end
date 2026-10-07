import { getResearchSnapshot } from "@/lib/research-workflow-server";
import { measurementsCsv } from "@/lib/research-workflow";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  const result = await getResearchSnapshot(studyId);
  if (result.status !== "available") return Response.json({ error: result.reason }, { status: result.status === "not-found" ? 404 : 503 });
  const format = new URL(request.url).searchParams.get("format");
  if (format && !["csv", "json"].includes(format)) return Response.json({ error: "Use json or csv." }, { status: 400 });
  const headers = { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename=research-${studyId}.${format === "csv" ? "csv" : "json"}` };
  return format === "csv" ? new Response(measurementsCsv(result.data), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } }) : Response.json(result.data, { headers });
}
