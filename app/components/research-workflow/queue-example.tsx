"use client";
import { useState } from "react";
import { ResearchSelect } from "@/app/components/research-workflow/select";
import { ClaimQueueView } from "@/app/components/research-workflow/claim-queue";
import { QUEUE_EXAMPLE, QUEUE_EXAMPLE_SNAPSHOT } from "@/lib/research-queue-example";
import { RECORD_KINDS, type ResearchRecord, type ResearchSnapshot } from "@/lib/research-workflow";
import { StudyPreparation } from "@/app/components/research-workflow/preparation";

const INTAKE_EXAMPLE: ResearchSnapshot = {
  ...QUEUE_EXAMPLE_SNAPSHOT,
  records: Object.fromEntries(RECORD_KINDS.map(kind => [kind, [] as ResearchRecord[]])) as ResearchSnapshot["records"],
  coverage: Object.fromEntries(RECORD_KINDS.map(kind => [kind, 0])) as ResearchSnapshot["coverage"],
};

export function QueueExample() {
  const [state, setState] = useState("mixed");
  const queue = state === "empty" || state === "intake" ? { ...QUEUE_EXAMPLE, jobs: [], events: [], coverage: { jobs: 0, events: 0 } } : QUEUE_EXAMPLE;
  return <details className="space-y-4 rounded-lg border p-4" data-testid="queue-example"><summary className="cursor-pointer text-sm font-medium">Explore an illustrative claim queue</summary><div className="mt-4 space-y-4"><p className="text-sm font-medium">Synthetic teaching example. These are illustrative claims, statuses and timestamps; no research paper was evaluated.</p><ResearchSelect label="Queue example state" value={state} onChange={setState} options={[{ value: "mixed", label: "Mixed work and blocked prerequisites" }, { value: "intake", label: "New study awaiting preparation" }, { value: "empty", label: "Claims with no queued jobs" }, { value: "unavailable", label: "Queue unavailable" }]} />{state === "intake" ? <StudyPreparation snapshot={INTAKE_EXAMPLE} showActions={false} /> : null}{state === "unavailable" ? <p role="alert" className="rounded-lg border p-4 text-sm text-destructive">Illustrative unavailable service: queue counts and status are unknown. Missing results are not zero jobs.</p> : <ClaimQueueView snapshot={state === "intake" ? INTAKE_EXAMPLE : QUEUE_EXAMPLE_SNAPSHOT} queue={queue} />}</div></details>;
}
