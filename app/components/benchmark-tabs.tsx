"use client";

import { BenchmarkStatus } from "./benchmark-status";

export function BenchmarkTabs() {
  return (
    <div className="mt-6 space-y-6">
      <p className="text-sm text-muted-foreground">Cloud benchmark execution has been retired. Run new experiments locally with Claude or Codex. Historical measurements remain available here.</p>
      <BenchmarkStatus canManage={false} />
    </div>
  );
}
