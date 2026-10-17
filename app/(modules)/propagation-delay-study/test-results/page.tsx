import type { Metadata } from "next";
import { StudyDashboard } from "@/app/components/delay-study/dashboard";
import { StudyHeader } from "@/app/components/delay-study/header";
import { getStudyData } from "@/lib/delay-study-server";

export const metadata: Metadata = { title: "Propagation delay study — test results" };
export const dynamic = "force-dynamic";
export default async function StudyResultsPage() {
  const data = await getStudyData();
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><StudyHeader title="Propagation delay study" description="An independent, partial reproduction of the paper’s delay-equalization mechanism. Explore real receiver measurements, matched repetitions, uncertainty, and the limits of each conclusion." />
    {data ? <StudyDashboard data={data} /> : <p className="rounded-md border p-6 text-sm">The study has not been registered in this database yet. No experimental results are available.</p>}
  </main>;
}
