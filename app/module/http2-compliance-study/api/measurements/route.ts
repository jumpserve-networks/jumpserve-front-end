import { getHttp2Measurements } from "@/lib/http2-study-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId || !/^archive-\d{3}$/.test(runId)) return Response.json({ error: "Invalid runId" }, { status: 400 });
  const rows = await getHttp2Measurements(runId);
  return Response.json({ measurements: rows }, { headers: { "Cache-Control": "no-store" } });
}
