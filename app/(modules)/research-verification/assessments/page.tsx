import { Assessments } from "@/app/components/research-workflow/assessments";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ before?: string | string[]; mine?: string | string[]; name?: string | string[]; view?: string | string[] }> }) {
  const { before, mine, name, view } = await searchParams;
  const cursor = Array.isArray(before) ? "invalid" : before;
  const filter = typeof name === "string" ? name.trim() : "";
  return <Assessments key={`${mine === "1" ? "mine" : "all"}:${cursor ?? "newest"}:${filter}`} before={cursor} mine={mine === "1"} name={filter} view={view === "card" ? "card" : "table"} />;
}
