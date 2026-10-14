"use client";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { researchRequest } from "@/lib/research-workflow-api";

export function NetworkJobCancel({ studyId, jobId, onSaved }: { studyId: string; jobId: string; onSaved: () => Promise<void> }) {
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const request = useRef("");
  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); request.current ||= crypto.randomUUID();
    try {
      await researchRequest(`/studies/${studyId}/network`, { method: "POST", body: JSON.stringify({ action: "cancel", request_id: request.current, job_id: jobId, reason }) });
      await onSaved(); setMessage("Cancellation recorded. The executor stops the test and confirms resource cleanup; available observations remain preserved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Cancellation was not confirmed; inspect retained status."); }
    finally { setBusy(false); }
  }
  return <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm">Cancel running networking test</summary>
    <form className="mt-3 space-y-3" onSubmit={cancel}>
      <label className="block space-y-1"><span>Networking cancellation reason</span><Textarea required disabled={busy} maxLength={2000} value={reason} onChange={event => { setReason(event.target.value); request.current = ""; }} /></label>
      <Button type="submit" variant="outline" disabled={busy || !reason.trim()}>Request networking cancellation</Button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  </details>;
}
