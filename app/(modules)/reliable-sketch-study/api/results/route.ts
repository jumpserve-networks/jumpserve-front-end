import { getReliableData, getReliableRuns } from "@/lib/reliable-study-server";
import { csvCell } from "@/lib/http2-study";
export const dynamic="force-dynamic";
export async function GET(request: Request) {
 const data=await getReliableData();if(!data)return Response.json({ error:"Study evidence unavailable; missing is not zero" },{ status:503 });
 const runs=await getReliableRuns();if(runs.length!==data.meta.counts.runs)return Response.json({ error:"Recorded run coverage differs; refusing incomplete export" },{ status:503 });
 if(new URL(request.url).searchParams.get("format")==="csv") {
  const keys=["id","campaign_id","configuration_id","stage","status","reason","seed","input_sha256","raw_sha256","started_at","ended_at"] as const;
  const metrics=["updates","distinct_keys","outliers","max_absolute_error","aae","are","interval_violations","lost_mass","nominal_bytes","allocated_counter_bytes","insert_mups","query_mqps"];
  const csv=[[...keys,...metrics].join(","),...runs.map(r => [...keys.map(k => csvCell(r[k])),...metrics.map(k => csvCell(r.measurements?.[k]))].join(","))].join("\r\n");
  return new Response(csv,{ headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=reliable-sketch-run-metrics.csv","Cache-Control":"no-store"} });
 }
 return Response.json({ ...data,runs,export_notes:"Public normalized evidence. Original copyrighted source bytes remain private. Our generated input and per-key raw CPU outputs are separately downloadable. Missing values remain null; seed min/max are descriptive." },{ headers:{"Content-Disposition":"attachment; filename=reliable-sketch-assessment-v1.json","Cache-Control":"no-store"} });
}
