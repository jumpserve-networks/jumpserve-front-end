"use client";

import { reviewSources } from "@/lib/idea-review-sources";
import { GUIDE_QUESTIONS } from "@/lib/idea-guide";
import type { IdeaPacket, IdeaRun } from "@/lib/research-ideas";

export function IdeaReviewSources({ run, packet }: { run: IdeaRun; packet?: IdeaPacket }) {
  let source;
  try { source = reviewSources(run, packet); }
  catch (error) { return <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "The recorded declarations could not be verified."}</p>; }
  if (!source) return null;
  return <details className="rounded-md border p-3">
    <summary className="cursor-pointer text-sm font-medium">Recorded declarations · plan version {source.version}</summary>
    <p className="my-2 text-xs text-muted-foreground">These are the original saved fields. The AI’s issue labels are judgments; check the recorded text before revising your plan.</p>
    {source.fields.length ? <dl className="space-y-3">{source.fields.map(field => <div key={field.path} className="min-w-0 space-y-1">
      <dt className="break-words text-xs font-medium">{GUIDE_QUESTIONS.find(question => question.id === field.path.split("/").at(-1))?.label ?? "Plan field"} · {field.path}</dt>
      <dd><pre aria-label={`Original ${field.path}`} className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{!field.present ? "Not recorded" : typeof field.value === "string" ? field.value || "Recorded empty string" : JSON.stringify(field.value, null, 2)}</pre><span className="text-xs text-muted-foreground">{field.state === "recorded" ? "Recorded value" : field.state === "null" ? "Recorded null" : field.state === "empty" ? "Recorded empty value" : "Missing value"}</span></dd>
    </div>)}</dl> : <p className="text-xs text-muted-foreground">No individual fields were flagged in this review.</p>}
  </details>;
}
