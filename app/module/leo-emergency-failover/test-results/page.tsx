import type { Metadata } from "next";
import { LeoHeader } from "@/app/components/leo-study/header";
import { LeoDashboard } from "@/app/components/leo-study/dashboard";
import { getLeoData } from "@/lib/leo-study-server";
export const metadata: Metadata = { title: "LEO failover study — results" };
export const dynamic = "force-dynamic";
export default async function LeoResultsPage() {
  const data = await getLeoData();
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><LeoHeader title="National emergency failover capacity" description="A computational reproduction of CosmoSim's optimistic downlink model. Compare the paper's published estimates with saved simulation outcomes, terminal placement, and orbital sensitivity." />
    {data ? <LeoDashboard data={data} /> : <p className="rounded-md border p-6 text-sm">This study has not been registered yet. No simulation results are available.</p>}
  </main>;
}
