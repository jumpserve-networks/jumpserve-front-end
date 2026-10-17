"use client";

import { EMULATED_MODULE_PATH } from "@/lib/test-modules";

import Link from "next/link";
import { Button } from "@/app/components/ui/button";

export default function BenchmarkError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-12">
      <h1 className="text-2xl font-bold">Unable to load benchmark</h1>
      <p role="alert" className="text-muted-foreground">The status service could not be reached. Try again to check this run.</p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" nativeButton={false} render={<Link href={`${EMULATED_MODULE_PATH}/benchmarks`} />}>Back to benchmarks</Button>
      </div>
    </main>
  );
}
