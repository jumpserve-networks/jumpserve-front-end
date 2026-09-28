import { getStudyClaims, getStudyData, getStudyPapers } from "@/lib/delay-study-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const [study, claims, literature] = await Promise.all([
    getStudyData(), getStudyClaims(), getStudyPapers(),
  ]);
  if (!study) return Response.json({ error: "Study not found" }, { status: 404 });
  return Response.json({
    schema_version: 1,
    exported_at: new Date().toISOString(),
    units: { throughput: "Mbps", delay: "ms", duration: "s", sensitivity: "log2(max mean goodput / min mean goodput)" },
    ...study,
    claims,
    literature,
  }, { headers: {
    "Content-Disposition": 'attachment; filename="jumpserve-propagation-delay-study.json"',
    "Cache-Control": "no-store",
  } });
}
