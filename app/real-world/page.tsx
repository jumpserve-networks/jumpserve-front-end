import type { Metadata } from "next";
import { RealWorldTests } from "@/app/components/real-world-tests";
import { requireGoogleUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Congestion Control Real World Tests" };
export default async function RealWorldPage() {
  await requireGoogleUser("/real-world");
  return <main className="mx-auto max-w-6xl px-4 py-8"><h1 className="text-2xl font-semibold">Congestion Control Real World Tests</h1>
    <p className="mt-2 text-sm text-muted-foreground">Measure TCP congestion control over real AWS network paths with independently placed EC2 machines.</p>
    <RealWorldTests />
  </main>;
}
