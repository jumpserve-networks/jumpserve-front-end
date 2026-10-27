"use client";

import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { loadSharedRecords, SHARED_RECORD_KINDS, type SharedRecordKind, type SharedRecords } from "@/lib/research-public-queue";
import { ResearchSelect } from "./select";

export function SharedAssessmentRecords({ studyId }: { studyId: string }) {
  const [selection, setSelection] = useState<{ kind: SharedRecordKind; after?: string; previous: (string | undefined)[] }>({ kind: "autonomy_workflows", previous: [] });
  const [result, setResult] = useState<{ key: string; data?: SharedRecords; error?: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const key = `${studyId}:${selection.kind}:${selection.after ?? ""}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    loadSharedRecords(studyId, selection.kind, selection.after, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch(error => { if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : "Assessment records are unavailable." }); });
    return () => controller.abort();
  }, [studyId, selection.kind, selection.after, key]);
  const current = result?.key === key ? result : null;
  const data = current?.data;
  return <section aria-label="Shared assessment records" className="space-y-4 rounded-lg border p-4 text-sm">
    <h2 className="font-semibold">Assessment records</h2>
    <ResearchSelect label="Recorded information" value={selection.kind} onChange={value => setSelection({ kind: value as SharedRecordKind, previous: [] })} options={Object.entries(SHARED_RECORD_KINDS).map(([value, label]) => ({ value, label }))} />
    {current?.error ? <div role="alert" className="space-y-2"><p>{current.error} Record coverage is unknown.</p><Button size="sm" variant="outline" onClick={() => setRevision(value => value+1)}>Try again</Button></div> : data ? <>
      <p>{data.coverage.returned} records on this page. {data.next_after ? "More records are available." : "End of this record collection."}</p>
      <p className="text-xs text-muted-foreground">{data.projection.note} {data.projection.redacted} values redacted · {data.projection.truncated} text values omitted or shortened by size limits.</p>
      {data.records.length ? <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">{JSON.stringify(data.records, null, 2)}</pre> : <p>No records of this kind were returned on this page.</p>}
      <div className="flex flex-wrap gap-3"><Button size="sm" variant="outline" disabled={!selection.previous.length} onClick={() => setSelection(value => ({ ...value, after: value.previous.at(-1), previous: value.previous.slice(0,-1) }))}>Previous records</Button><Button size="sm" variant="outline" disabled={!data.next_after} onClick={() => setSelection(value => ({ ...value, after: data.next_after ?? undefined, previous: [...value.previous, value.after] }))}>Next records</Button></div>
    </> : <p role="status">Loading assessment records…</p>}
  </section>;
}
