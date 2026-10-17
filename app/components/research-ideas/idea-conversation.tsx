"use client";

import { useEffect, useRef } from "react";
import { guideAnswer } from "@/lib/idea-guide";
import { interviewDetails, interviewTurns } from "@/lib/idea-interview";
import type { IdeaState } from "@/lib/research-ideas";

export function IdeaConversation({ state, active }: { state: IdeaState; active: boolean }) {
  const transcript = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  const turns = interviewTurns(state);
  const hasTurns = turns.length > 0;
  useEffect(() => {
    if (active && transcript.current) {
      following.current = true;
      transcript.current.scrollTop = transcript.current.scrollHeight;
    }
  }, [active, state.runs.length, state.packets.length]);
  useEffect(() => {
    const element = transcript.current;
    if (!active || !element) return;
    const observer = new ResizeObserver(() => {
      if (following.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, hasTurns]);

  if (!turns.length) return null;
  return <details open className="rounded-md border p-3">
    <summary className="cursor-pointer text-sm font-medium">Conversation and saved answers · {turns.length} entries</summary>
    <div ref={transcript} onScroll={event => { const element = event.currentTarget; following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 4; }} className="mt-3 max-h-96 space-y-3 overflow-y-auto" role="log" aria-label="Planning conversation history">
      {turns.map(turn => {
        if (turn.kind === "answer") return <article key={turn.packet.id} className="ml-6 space-y-1 rounded-lg border bg-primary/5 p-3">
          <p className="text-xs font-medium text-muted-foreground">You · {turn.field.label} · version {turn.packet.version}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{guideAnswer(turn.packet.document, turn.field)}</p>
        </article>;
        const { run } = turn;
        const ownerMessage = interviewDetails(run)?.owner_message;
        const asked = typeof ownerMessage === "string" && ownerMessage.startsWith("Question for the guide: ") ? ownerMessage.slice("Question for the guide: ".length) : null;
        return <div key={run.id} className="space-y-3">
          {asked ? <article className="ml-6 rounded-lg border bg-primary/5 p-3 text-sm"><p className="text-xs font-medium text-muted-foreground">You · discussion</p><p className="whitespace-pre-wrap break-words">{asked}</p></article> : null}
          <article className="mr-3 space-y-1 rounded-lg bg-muted p-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground">AI guide · version {state.packets.find(p => p.id === run.packet_id)?.version ?? "unavailable"} · {run.status}{run.packet_id !== state.current_packet_id ? " · earlier plan" : ""}</p>
            <p className="whitespace-pre-wrap break-words">{run.output?.summary ?? run.reason ?? "Waiting for a recorded response."}</p>
            {run.status === "complete" ? run.output?.questions.map((question, index) => <p key={index} className="whitespace-pre-wrap break-words font-medium">{question}</p>) : null}
            <details><summary className="cursor-pointer text-xs text-muted-foreground">AI provenance</summary><p className="break-words text-xs">Model: {run.model_id}. Prompt: {run.prompt_version_id}. Attempt: {run.id}. Suggestions are model outputs, not measurements or approval.</p></details>
          </article>
        </div>;
      })}
    </div>
  </details>;
}
