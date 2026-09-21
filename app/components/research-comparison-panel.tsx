"use client";

import { EMULATED_MODULE_PATH } from "@/lib/test-modules";

import Link from "next/link";
import { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/app/components/ui/collapsible";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/app/components/ui/table";
import { compareConfigurations, configurationLabel, formatSeconds, quantile, BOOTSTRAP_SAMPLES } from "@/lib/research-comparison";
import type { AggregateDelayGraphPoint } from "@/lib/emulated-runs-data";

export function ResearchComparisonPanel({ points, selectedClients }: { points: AggregateDelayGraphPoint[]; selectedClients: number[] }) {
  const result = useMemo(() => compareConfigurations(points, selectedClients), [points, selectedClients]);
  const reasons = new Map<string, number>();
  for (const row of result.excluded) reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);
  const repeats = (cca: "bbr" | "cubic") => result.blocks.reduce((n, b) => n + b[cca].length, 0);

  return (
    <div className="min-w-0 space-y-5">
      <div className="space-y-2 text-sm leading-6 text-muted-foreground">
        <p className="font-medium text-foreground">{result.blocks.length} matched configurations · {repeats("bbr")} BBR parent runs · {repeats("cubic")} CUBIC parent runs · {result.excluded.length} excluded parent runs</p>
        <p>Compares homogeneous BBR experiments with homogeneous CUBIC experiments. Matching requires the same recorded runner, link, queue, sampling interval, and every client’s workload, delay, and start time. Other launch settings are also matched.</p>
        <p>Each parent run contributes one outcome: the median FCT of its selected clients. Every matched configuration has equal weight, regardless of its number of repetitions. Positive CUBIC − BBR differences mean slower completion with CUBIC.</p>
      </div>

      {!result.blocks.length ? (
        <Card><CardContent className="text-sm leading-6">No configuration-matched comparison is available. Select both algorithms’ runs with identical settings. Missing launch configuration, incomplete results, mixed algorithms, and configurations present in only one cohort are excluded.</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {([ ["Median FCT", result.median], ["p90 FCT", result.p90] ] as const).map(([name, metric]) => metric && (
            <Card key={name} className="gap-3">
              <CardHeader><h3 className="text-base font-semibold">{name} difference</h3></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-2xl font-semibold tabular-nums">{formatSeconds(metric.delta, true)}</p>
                <p>BBR {formatSeconds(metric.bbr)} · CUBIC {formatSeconds(metric.cubic)}</p>
                <p className="text-muted-foreground">Mean of the within-configuration {name.toLowerCase()} estimates; these are not pooled percentiles.</p>
                <p className="font-medium">95% exploratory CI: {metric.interval ? `${formatSeconds(metric.interval.low, true)} to ${formatSeconds(metric.interval.high, true)}` : "Unavailable"}</p>
                {!metric.interval && <p className="text-muted-foreground">Requires at least {metric.minimum} parent-run repetitions per algorithm in every matched configuration. The displayed difference is descriptive only.</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {result.blocks.length > 0 && <Table>
        <TableHeader><TableRow>
          <TableHead>Matched configuration</TableHead><TableHead>BBR n</TableHead><TableHead>CUBIC n</TableHead><TableHead>BBR median</TableHead><TableHead>CUBIC median</TableHead><TableHead>CUBIC − BBR</TableHead>
        </TableRow></TableHeader>
        <TableBody>{result.blocks.map((block, index) => {
          const left = quantile(block.bbr.map(r => r.value), .5), right = quantile(block.cubic.map(r => r.value), .5);
          return <TableRow key={block.key}>
            <TableCell className="max-w-sm min-w-64 whitespace-normal">
              <p className="font-medium">Configuration {index + 1}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{configurationLabel(block.configuration)}</p>
              <Collapsible className="mt-2">
                <CollapsibleTrigger className="rounded text-xs text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Settings and run IDs</CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2 text-xs">
                  <p>Representative recorded settings; CCAs vary between the two cohorts.</p>
                  {(["bbr", "cubic"] as const).map(cca => <p key={cca}>{cca.toUpperCase()}: {block[cca].map(r => <Link key={r.parentRunId} className="mr-2 text-primary underline" href={`${EMULATED_MODULE_PATH}/parent-run/${r.parentRunId}`}>#{r.parentRunId}</Link>)}</p>)}
                  <pre className="max-h-64 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap break-all">{JSON.stringify(block.configuration, null, 2)}</pre>
                </CollapsibleContent>
              </Collapsible>
            </TableCell>
            <TableCell>{block.bbr.length}</TableCell><TableCell>{block.cubic.length}</TableCell>
            <TableCell>{formatSeconds(left)}</TableCell><TableCell>{formatSeconds(right)}</TableCell><TableCell>{formatSeconds(right - left, true)}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>}

      {reasons.size > 0 && <div className="rounded-lg border border-border bg-muted p-4 text-sm">
        <p className="font-medium">Excluded from comparison</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">{[...reasons].map(([reason, n]) => <li key={reason}>{reason}: {n} {n === 1 ? "parent run" : "parent runs"}</li>)}</ul>
      </div>}
      <p className="text-xs leading-5 text-muted-foreground">
        Intervals use {BOOTSTRAP_SAMPLES.toLocaleString()} deterministic percentile bootstrap resamples of parent runs independently within each algorithm and configuration; the configuration set is held fixed. No trial-pair IDs or randomization are recorded, so this is configuration matching, not a paired-trial or causal estimate. Intervals assume independent parent runs, are pointwise, and can be unreliable with few repetitions or no observed variation. Historical runner/kernel revisions may be unrecorded. Completed transfers only: missing FCT is excluded, not treated as zero.
      </p>
    </div>
  );
}
