import { Assessments } from "@/app/components/research-workflow/assessments";
import { getGoogleUser } from "@/lib/auth";
import { getSyntheticBatchConfiguration } from "@/lib/synthetic-batch-server";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ before?: string | string[]; mine?: string | string[]; name?: string | string[]; view?: string | string[] }> }) {
  const { before, mine, name, view } = await searchParams;
  const cursor = Array.isArray(before) ? "invalid" : before;
  const filter = typeof name === "string" ? name.trim() : "";
  const mineOnly = mine === "1";
  const configuration = mineOnly ? getSyntheticBatchConfiguration() : null;
  const canStartSyntheticBatch = configuration !== null &&
    (await getGoogleUser().catch(() => null))?.id === configuration.ownerId;
  return <Assessments
    key={`${mineOnly ? "mine" : "all"}:${cursor ?? "newest"}:${filter}`}
    before={cursor}
    mine={mineOnly}
    name={filter}
    view={view === "card" ? "card" : "table"}
    canStartSyntheticBatch={canStartSyntheticBatch}
  />;
}
