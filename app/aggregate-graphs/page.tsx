import { AggregateGraphsPanel } from "@/app/components/aggregate-graphs-panel";
import { requireGoogleUser } from "@/lib/auth";
import { fetchAggregateDelayGraphData } from "@/lib/emulated-runs-data";

export default async function AggregateGraphsPage() {
  await requireGoogleUser("/aggregate-graphs");

  const data = await fetchAggregateDelayGraphData();

  return <AggregateGraphsPanel data={data} />;
}
