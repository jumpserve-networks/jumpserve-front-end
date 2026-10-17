import { REAL_WORLD_MODULE_PATH } from "@/lib/test-modules";
import Link from "next/link";
import { SignInToRun } from "@/app/components/sign-in-to-run";
import type { Metadata } from "next";
import { RealWorldTests } from "@/app/components/real-world-tests";
import { getGoogleUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Congestion Control Real World Tests" };
export default async function RealWorldPage() {
  const user = await getGoogleUser();
  return <main className="mx-auto max-w-6xl px-4 py-8"><h1 className="text-2xl font-semibold">Congestion Control Real World Tests</h1>
    <p className="mt-2 text-sm text-muted-foreground">Measure TCP congestion control over real AWS network paths with independently placed EC2 machines.</p>
    {user ? <RealWorldTests /> : <div className="mt-6 space-y-4"><SignInToRun nextPath={`${REAL_WORLD_MODULE_PATH}/run-a-test`} /><Link href={`${REAL_WORLD_MODULE_PATH}/test-results`} className="text-sm underline underline-offset-4">Browse test results</Link></div>}
  </main>;
}
