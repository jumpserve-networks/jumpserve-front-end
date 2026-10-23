"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Checkbox } from "@/app/components/ui/checkbox";
import { researchRequest } from "@/lib/research-workflow-api";
import { experimentQueuePath } from "@/lib/research-experiment-queue";
import { validatePaperReview, type PaperReview } from "@/lib/research-paper-review";

export function PaperReviewPanel({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [review, setReview] = useState<PaperReview | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const initialized = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const value = validatePaperReview(await researchRequest<PaperReview>("/paper-uploads", { method: "POST", body: JSON.stringify({ action: "review", request_id: assessmentId }), signal: controller.signal }), assessmentId);
        if (controller.signal.aborted) return;
        setReview(value); setError("");
        if (value.status === "confirmed" || !initialized.current && value.status !== "preparing") {
          setTitle(value.confirmation?.title ?? value.title ?? ""); setDomain(value.confirmation?.domain ?? value.domain ?? "");
          setSelected(value.confirmation?.claim_ids ?? value.claims.map(c => c.id)); initialized.current = true;
        }
        if (value.status === "preparing") timer = setTimeout(load, 3000);
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Paper information could not be loaded."); }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [assessmentId, retry]);
  async function confirm(event: FormEvent) {
    event.preventDefault(); if (inFlight.current || !review || !review.can_start) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const value = validatePaperReview(await researchRequest<PaperReview>("/paper-uploads", { method: "POST", body: JSON.stringify({ action: "confirm", request_id: assessmentId, revision: review.revision, title, domain, claim_ids: selected }) }), assessmentId);
      if (value.status !== "confirmed") throw new Error("Assessment start is unconfirmed. Retry using this same review.");
      setReview(value); router.push(experimentQueuePath(assessmentId));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Confirmation could not be saved. Retry this same review."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const preparing = review?.status === "preparing";
  return <section className="space-y-5">
    <p className="text-sm text-muted-foreground">1. Upload PDF <span aria-hidden>→</span> <strong className="text-foreground">2. Review information</strong> <span aria-hidden>→</span> 3. Run assessment</p>
    {error ? <div role="alert" className="space-y-3 rounded-lg border p-4 text-sm"><p className="text-destructive">{error}</p><Button variant="outline" disabled={busy} onClick={() => setRetry(n => n + 1)}>Reload paper information</Button></div> : null}
    {!review || preparing ? <div role="status" className="space-y-2 rounded-lg border p-5"><h2 className="font-semibold">{review ? "Preparing your paper…" : "Loading paper information…"}</h2><p className="text-sm text-muted-foreground">Preparing the title, research domain and source-linked claims. Claim experiments will wait for your confirmation. You can return to this page later.</p>{review ? <p className="text-sm">{review.progress}</p> : null}{review?.claims.length ? <p className="text-sm">{review.claims.length} candidate claims found so far.</p> : null}</div> : null}
    {review?.status === "failed" ? <div role="alert" className="space-y-2 rounded-lg border p-5"><h2 className="font-semibold">Paper preparation needs attention</h2><p className="text-sm">{review.reason ?? "The paper could not be fully prepared."}</p><p className="text-sm text-muted-foreground">No claim experiments have started. Original files and preparation records are retained.</p><Link className="text-sm underline" href={experimentQueuePath(assessmentId)}>View preparation details</Link></div> : null}
    {review && ["ready", "confirmed"].includes(review.status) ? <form onSubmit={confirm} aria-label="Confirm paper information" className="space-y-5 rounded-lg border p-5">
      <p className="text-sm text-muted-foreground">Check the suggested details and select the claims you want to assess. AI extraction can omit or misidentify claims; extracted text does not cover all figures, tables or supplements.</p>
      <div className="space-y-2 text-sm"><label htmlFor="review-paper-title" className="font-medium">Title</label><Input className="text-foreground" id="review-paper-title" required maxLength={300} value={title} onChange={event => setTitle(event.target.value)} disabled={busy || review.status === "confirmed"} aria-describedby={!review.title ? "review-title-help" : undefined} />{!review.title ? <p id="review-title-help" className="text-muted-foreground">The title could not be identified. Enter the paper’s title.</p> : null}</div>
      <div className="space-y-2 text-sm"><label htmlFor="review-paper-domain" className="font-medium">Research Domain</label><Input className="text-foreground" id="review-paper-domain" required maxLength={5000} value={domain} onChange={event => setDomain(event.target.value)} disabled={busy || review.status === "confirmed"} aria-describedby={!review.domain ? "review-domain-help" : undefined} />{!review.domain ? <p id="review-domain-help" className="text-muted-foreground">The research domain could not be identified. Enter the field of research.</p> : null}</div>
      <fieldset className="space-y-3" disabled={busy || review.status === "confirmed"}><legend className="mb-2 font-medium">Claims</legend><p className="text-sm text-muted-foreground">{selected.length} selected of {review.claims.length} extracted candidates. Unselected claims remain recorded.</p>
        {review.claims.map((claim, index) => <label key={claim.id} className="flex cursor-pointer items-start gap-3 rounded-md border p-4 text-sm"><Checkbox className="mt-1" disabled={busy || review.status === "confirmed"} checked={selected.includes(claim.id)} onCheckedChange={checked => setSelected(previous => checked ? [...previous, claim.id] : previous.filter(id => id !== claim.id))} aria-label={`Include claim ${index + 1}`} /><span className="min-w-0 space-y-2"><span className="block whitespace-pre-wrap break-words">{claim.description}</span><span className="block text-xs text-muted-foreground">{claim.location} · {claim.claim_type}</span></span></label>)}
      </fieldset>
      {review.status === "confirmed" ? <Link className="underline" href={experimentQueuePath(assessmentId)}>View assessment progress</Link> : <><p className="text-xs text-muted-foreground">Preparation and assessment share the paper’s $100 spending limit and seven-day window.</p>{!review.can_start ? <p role="alert" className="text-sm text-destructive">This paper’s authorization no longer admits work. Review the preparation details in Experiment Queue.</p> : null}<Button type="submit" size="lg" disabled={busy || !review.can_start || selected.length === 0 || !title.trim() || !domain.trim()}>{busy ? "Starting assessment…" : "Confirm and start assessment"}</Button></>}
    </form> : null}
  </section>;
}
