import { getLeoData } from "@/lib/leo-study-server";
export const dynamic = "force-dynamic";
export async function GET() {
  const data = await getLeoData();
  if (!data) return Response.json({ error: "Study unavailable" }, { status: 404 });
  return Response.json(data, { headers: { "Content-Disposition": "attachment; filename=leo-failover-results.json", "Cache-Control": "no-store" } });
}
