import { getIPv6Data } from "@/lib/ipv6-study-server";
export const dynamic = "force-dynamic";
export async function GET() {
 try { const d = await getIPv6Data(); return d ? Response.json(d, { headers: { "Cache-Control": "no-store", "Content-Disposition": "attachment; filename=ipv6-study-data.json" } }) : Response.json({ error: "Study data unavailable; missing is not zero" }, { status: 503 }); }
 catch { return Response.json({ error: "Study data temporarily unavailable" }, { status: 503 }); }
}
