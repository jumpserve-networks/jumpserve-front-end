"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { LocalDateTime } from "@/app/components/user-preferences";
import { loadPaperDetail, type PaperDetail } from "@/lib/research-paper-catalog";
import { PaperAuthors } from "./paper-bibliography";
import { ResearchHeader } from "./header";
import { PaperQualityHistoryMenu } from "./paper-quality-history-dialog";
import { AssessmentGapExperiments } from "./experiment-queue";

const DETAIL_POLL_MS = 10000;

export function AssessmentDetail({ assessmentId, gapId, launchId, children, embedded = false }: { assessmentId: string; gapId?: string; launchId?: string; children?: ReactNode; embedded?: boolean }) {
  const [detail, setDetail] = useState<PaperDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const value = await loadPaperDetail(assessmentId, controller.signal);
        if (!controller.signal.aborted) { setDetail(value); setDetailError(""); }
      } catch (error) {
        if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : "Assessment details are unavailable.");
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, DETAIL_POLL_MS);
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [assessmentId, revision]);

  const paper = detail?.paper;
  const title = paper?.title ?? (detail || detailError ? "Paper title unavailable" : "Loading assessment…");

  const Container = embedded ? "section" : "main";
  return <Container className={embedded ? "space-y-6" : "mx-auto max-w-6xl space-y-6 px-4 py-6"} data-testid={embedded ? "assessment-paper-header" : "assessment-detail"}>
    <ResearchHeader title={title} showModuleLabel={false} actions={<PaperQualityHistoryMenu />} />
    {paper ? <div className="space-y-2 text-sm">
      <PaperAuthors authors={paper.authors} />
      <p>Initiated by: {paper.initiated_by ?? "Name unavailable"}</p>
      <p className="text-muted-foreground">Submitted <LocalDateTime value={paper.created_at} /></p>
    </div> : null}
    {children}
    {detailError ? <p role="alert" className="content-panel rounded-lg border p-4 text-sm text-destructive">Assessment details are unavailable. {detailError} {detail ? "Previously retrieved details may be stale." : ""}</p> : null}
    {detailError ? <Button variant="outline" onClick={() => setRevision(value => value + 1)}>Retry details</Button> : null}
    {!detail && !detailError ? <p role="status">Loading assessment information…</p> : null}
    {gapId ? <AssessmentGapExperiments studyId={assessmentId} gapId={gapId} launchId={launchId} /> : null}
  </Container>;
}
