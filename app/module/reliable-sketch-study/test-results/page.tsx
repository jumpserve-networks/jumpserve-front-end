import { ReliableHeader } from "@/app/components/reliable-study/header";
import { ReliableDashboard } from "@/app/components/reliable-study/dashboard";
import { getReliableData } from "@/lib/reliable-study-server";
export const dynamic = "force-dynamic";
export default async function Results() {
 const data = await getReliableData();
 return <main className="mx-auto max-w-7xl px-4 py-6"><ReliableHeader title="ReliableSketch results and discrepancies" description="IMC 2025 stream summary: recorded CPU measurements, finite correctness checks, explicit memory budgets and limits of reproduction." />{data ? <ReliableDashboard data={data} /> : <p role="status">Study data is unavailable. Missing results have not been replaced with zero.</p>}</main>;
}
