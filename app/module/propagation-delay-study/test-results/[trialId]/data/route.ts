import { getStudyTrial } from "@/lib/delay-study-server";
import { STUDY_ID } from "@/lib/delay-study";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ trialId: string }> }) {
  const { trialId } = await params;
  const data = await getStudyTrial(trialId);
  if (!data) return Response.json({ error: "Trial not found" }, { status: 404 });
  return Response.json({
    schema_version: 1,
    campaign_id: STUDY_ID,
    exported_at: new Date().toISOString(),
    units: { throughput: "Mbps", delay: "ms", duration: "s", payload: "bytes" },
    ...data,
  }, { headers: {
    "Content-Disposition": `attachment; filename="jumpserve-trial-${data.trial.id}.json"`,
    "Cache-Control": "no-store",
  } });
}
