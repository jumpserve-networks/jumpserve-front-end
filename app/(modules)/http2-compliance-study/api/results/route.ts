import { getHttp2Data, getHttp2Frames, getHttp2Measurements } from "@/lib/http2-study-server";
import { csvCell } from "@/lib/http2-study";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format") ?? "json";
  if (!["json", "csv"].includes(format)) return Response.json({ error: "format must be json or csv" }, { status: 400 });
  const [data, measurements, frames] = await Promise.all([getHttp2Data(), getHttp2Measurements(), getHttp2Frames()]);
  if (!data) return Response.json({ error: "Study unavailable" }, { status: 404 });
  if (format === "csv") {
    const keys = ["run_id", "test_id", "side", "description", "rfc_section", "expected", "expected_scope", "author_outcome", "outcome", "status", "reason", "error_code", "observed_scope", "scope_compatible", "preserved_rule_conformant"] as const;
    return new Response([keys.join(","), ...measurements.map(row => keys.map(k => csvCell(row[k])).join(","))].join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=http2-archive-measurements.csv", "Cache-Control": "no-store" } });
  }
  return Response.json({ ...data, measurements, frames, export_notes: "Public normalized evidence and owned-loopback traces. Raw author worker payloads remain private. Nulls remain missing; no inferred confidence intervals." }, { headers: { "Content-Disposition": "attachment; filename=http2-assessment-v3.json", "Cache-Control": "no-store" } });
}
