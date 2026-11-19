"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { EllipsisIcon } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/app/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/app/components/ui/dropdown-menu";
import type { PaperQualityProgress, PaperQualityStep } from "@/lib/paper-quality";
import { PAPER_ASSESSMENT_STEPS } from "@/lib/paper-assessment-wizard";
import { PaperQualityFeedback } from "./paper-quality-feedback";

const History = createContext<{ show: () => void; attachTrigger: (element: HTMLButtonElement | null) => void } | null>(null);
type HistoryEntry = { id: string; label?: string; quality?: PaperQualityProgress };

function HistoryContent({ quality, step }: { quality?: PaperQualityProgress; step: PaperQualityStep }) {
  return <>
    {quality ? <PaperQualityFeedback quality={quality} step={step} showHistoryHeading={false} /> : null}
    {!quality?.history?.length && !quality?.agent_history?.length && !quality?.findings.length && !quality?.history_unavailable ? <p className="text-muted-foreground">No review or repair rounds have been recorded yet.</p> : null}
  </>;
}

/** Supplies already authorized owner history to the separately rendered title. */
export function PaperQualityHistoryProvider({ quality, step = 2, entries, children }: { quality?: PaperQualityProgress; step?: PaperQualityStep | null; entries?: HistoryEntry[]; children: ReactNode }) {
  const inherited = useContext(History);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const rows = entries ?? [{ id: "step", quality }];
  return <History.Provider value={step === null ? inherited : { show: () => setOpen(true), attachTrigger: element => { trigger.current = element; } }}>
    {children}
    {step !== null ? <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent finalFocus={trigger} className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogTitle className="pr-10">Review and Repair History</DialogTitle>
        <DialogDescription>Step {step} · {PAPER_ASSESSMENT_STEPS[step - 1].title}</DialogDescription>
        {rows.map(entry => entry.label ? <section key={entry.id} aria-label={entry.label} className="space-y-4"><h3 className="font-semibold">{entry.label}</h3><HistoryContent quality={entry.quality} step={step} /></section> : <HistoryContent key={entry.id} quality={entry.quality} step={step} />)}
        {!rows.length ? <p className="text-muted-foreground">No review or repair rounds have been recorded yet.</p> : null}
      </DialogContent>
    </Dialog> : null}
  </History.Provider>;
}

export function PaperQualityHistoryMenu() {
  const history = useContext(History);
  if (!history) return null;
  return <DropdownMenu>
    <DropdownMenuTrigger ref={element => history.attachTrigger(element)} render={<Button variant="ghost" size="icon" className="shrink-0" aria-label="Paper actions" />}>
      <EllipsisIcon aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-auto rounded-none ring-0">
      <DropdownMenuItem onClick={() => history.show()}>Review and Repair History</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
