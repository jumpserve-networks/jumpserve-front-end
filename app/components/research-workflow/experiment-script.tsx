"use client";

import { Button } from "@/app/components/ui/button";
import { downloadReportFile } from "@/lib/report-download";

export function ExperimentScript({ path, content }: { path: string; content: string }) {
  const filename = path.slice(path.lastIndexOf("/") + 1);
  return <div className="flex items-start gap-3">
    <details className="min-w-0 flex-1 space-y-2">
      <summary className="cursor-pointer py-1.5 font-mono text-sm [overflow-wrap:anywhere]">{path}</summary>
      <pre tabIndex={0} aria-label={`Source for ${path}`} className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre [overflow-wrap:normal]"><code>{content}</code></pre>
    </details>
    <Button type="button" variant="outline" size="sm" aria-label={`Download ${path}`}
      onClick={() => downloadReportFile(filename, content, "text/plain;charset=utf-8")}>Download</Button>
  </div>;
}
