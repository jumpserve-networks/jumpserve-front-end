import { getIPv6Data } from "@/lib/ipv6-study-server";
export const dynamic = "force-dynamic";
export async function GET() {
 const data = await getIPv6Data();
 if (!data) return Response.json({ error: "Study evidence unavailable" }, { status: 503 });
 return Response.json({ analysis_version: data.meta.analysis_version, scientific_status: "Limited historical assessment; source, packet, client-side, route, causal and operational coverage incomplete", software_release: data.meta.provenance.software_release ?? { status: "Predeployment checks passed; deployed verification pending", authenticated_chat: "Conditional gap: no legitimate Google session" }, validation: data.meta.validation }, { headers: { "Cache-Control": "no-store" } });
}
