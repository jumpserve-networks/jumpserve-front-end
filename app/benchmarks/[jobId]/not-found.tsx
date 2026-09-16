import Link from "next/link";

export default function BenchmarkNotFound() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-12">
      <h1 className="text-2xl font-bold">Benchmark not found</h1>
      <p className="text-muted-foreground">This run does not exist or is unavailable to your account.</p>
      <Link href="/benchmarks" className="text-primary underline">Back to benchmarks</Link>
    </main>
  );
}
