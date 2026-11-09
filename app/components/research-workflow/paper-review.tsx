"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Checkbox } from "@/app/components/ui/checkbox";
import { researchRequest } from "@/lib/research-workflow-api";
import { experimentQueuePath } from "@/lib/research-experiment-queue";
import { validatePaperReview, reviewRoles, parseReviewAuthors, PAPER_AUTHORS_VERSION, type ReviewGroup, type PaperReview } from "@/lib/research-paper-review";
import { usePaperUploads } from "@/app/components/research-workflow/paper-uploads-provider";

export function PaperReviewPanel({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const { trackAssessment } = usePaperUploads();
  const [review, setReview] = useState<PaperReview | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [domain, setDomain] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const initialized = useRef(false);
  const [roles, setRoles] = useState<Record<string, ReviewGroup>>({});
  const [otherOpen, setOtherOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [otherLimit, setOtherLimit] = useState(20);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const value = validatePaperReview(await researchRequest<PaperReview>("/paper-uploads", { method: "POST", body: JSON.stringify({ action: "review", request_id: assessmentId }), signal: controller.signal }), assessmentId);
        if (controller.signal.aborted) return;
        setReview(value); setError("");
        if (value.status === "confirmed" || !initialized.current && value.status !== "preparing") {
          setTitle(value.confirmation?.title ?? value.title ?? ""); setDomain(value.confirmation?.domain ?? value.domain ?? "");
          setAuthors((value.confirmation?.authors ?? value.authors ?? []).join("\n"));
          setSelected(value.confirmation?.claim_ids ?? []); setRoles(reviewRoles(value)); initialized.current = true;
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
      const value = validatePaperReview(await researchRequest<PaperReview>("/paper-uploads", { method: "POST", body: JSON.stringify({ action: "confirm", request_id: assessmentId, revision: review.revision, title, domain, ...(review.authors_version === PAPER_AUTHORS_VERSION ? { authors: parseReviewAuthors(authors) } : {}), claim_ids: selected, selection: { central_claims: selected.filter(id => roles[id] === "central_claims"), testable_findings: selected.filter(id => roles[id] === "testable_findings") } }) }), assessmentId);
      if (value.status !== "confirmed") throw new Error("Assessment start is unconfirmed. Retry using this same review.");
      setReview(value); trackAssessment(assessmentId, value.confirmation!.title); router.push(experimentQueuePath(assessmentId));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Confirmation could not be saved. Retry this same review."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function organize() {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError("");
    try {
      const value = validatePaperReview(await researchRequest<PaperReview>("/paper-uploads", { method: "POST", body: JSON.stringify({ action: "organize", request_id: assessmentId }) }), assessmentId);
      initialized.current = false; setReview(value); setSelected([]); setRoles({}); setRetry(n => n + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Paper organization could not be requested."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const preparing = review?.status === "preparing";
  const groupingReady = review?.organization?.status === "ready";
  const readOnly = busy || review?.status === "confirmed" || !review?.organization;
  const other = review?.claims.filter(claim => !roles[claim.id]) ?? [];
  const matching = other.filter(claim => `${claim.description} ${claim.location}`.toLowerCase().includes(query.toLowerCase()));
  const selectedCount = (group: ReviewGroup) => selected.filter(id => roles[id] === group).length;
  function groupSelection(group: ReviewGroup, include: boolean) {
    const ids = review!.claims.filter(claim => roles[claim.id] === group).map(claim => claim.id);
    setSelected(previous => include ? [...new Set([...previous, ...ids])] : previous.filter(id => !ids.includes(id)));
  }
  function move(id: string, group?: ReviewGroup) {
    setRoles(previous => { const next = { ...previous }; if (group) next[id] = group; else delete next[id]; return next; });
    if (!group) setSelected(previous => previous.filter(value => value !== id));
  }
  return <section className="space-y-5">
    <p className="text-sm text-muted-foreground">1. Upload PDF <span aria-hidden>→</span> <strong className="text-foreground">2. Review information</strong> <span aria-hidden>→</span> 3. Run assessment</p>
    {error ? <div role="alert" className="space-y-3 rounded-lg border p-4 text-sm"><p className="text-destructive">{error}</p><Button type="button" variant="outline" disabled={busy} onClick={() => setRetry(n => n + 1)}>Reload paper information</Button></div> : null}
    {!review || preparing ? <div role="status" className="space-y-2 rounded-lg border p-5"><h2 className="font-semibold">{review ? "Preparing your paper…" : "Loading paper information…"}</h2><p className="text-sm text-muted-foreground">We’ll notify you when the paper is ready to review.</p>{review ? <p className="text-sm">{review.progress}</p> : null}{review?.claims.length ? <p className="text-sm">{review.claims.length} candidate claims found so far.</p> : null}</div> : null}
    {review?.status === "failed" ? <div role="alert" className="space-y-2 rounded-lg border p-5"><h2 className="font-semibold">Paper preparation needs attention</h2><p className="text-sm">{review.reason ?? "The paper could not be fully prepared."}</p>{review.organization && review.claims.length ? <Button type="button" variant="outline" disabled={busy} onClick={() => void organize()}>Organize extracted statements</Button> : null}<Link className="text-sm underline" href={experimentQueuePath(assessmentId)}>View preparation details</Link></div> : null}
    {review && ["ready", "confirmed"].includes(review.status) ? <form onSubmit={confirm} aria-label="Confirm paper information" className="space-y-5 rounded-lg border p-5">
      <div className="space-y-2 text-sm"><label htmlFor="review-paper-title" className="font-medium">Title</label><Input className="text-foreground" id="review-paper-title" required maxLength={300} value={title} onChange={event => setTitle(event.target.value)} disabled={busy || review.status === "confirmed"} aria-describedby={!review.title ? "review-title-help" : undefined} />{!review.title ? <p id="review-title-help" className="text-muted-foreground">Title not identified.</p> : null}</div>
      <div className="space-y-2 text-sm"><label htmlFor="review-paper-authors" className="font-medium">Authors</label><Textarea className="text-foreground" id="review-paper-authors" rows={2} maxLength={40100} value={authors} onChange={event => setAuthors(event.target.value)} placeholder="One author per line" disabled={busy || review.status === "confirmed" || review.authors_version !== PAPER_AUTHORS_VERSION} /></div>
      <div className="space-y-2 text-sm"><label htmlFor="review-paper-domain" className="font-medium">Research Domain</label><Input className="text-foreground" id="review-paper-domain" required maxLength={5000} value={domain} onChange={event => setDomain(event.target.value)} disabled={busy || review.status === "confirmed"} aria-describedby={!review.domain ? "review-domain-help" : undefined} />{!review.domain ? <p id="review-domain-help" className="text-muted-foreground">Research domain not identified.</p> : null}</div>
      <p className="text-sm">{review.claims.length} source-linked statements extracted.</p>
      <p role="status" className="text-sm">{review.status === "confirmed" && !review.confirmation?.selection ? `${selected.length} statements included in the original assessment; group labels were not recorded.` : `${selectedCount("central_claims")} central claims and ${selectedCount("testable_findings")} testable findings selected for assessment.`}</p>
      {!groupingReady ? <div role="status" className="space-y-3 rounded-md border p-4 text-sm"><h2 className="font-semibold">{review.organization?.status === "preparing" ? "Organizing extracted statements" : "Central claims and findings have not been organized"}</h2><p>{review.organization?.status === "preparing" ? `Reviewed ${review.organization.cursor} of ${review.organization.candidate_count} statements for the shortlist. Suggestions are incomplete.` : "Extracted statements are available below."}</p>{review.organization?.rationale ? <p className="text-muted-foreground">{review.organization.rationale}</p> : null}{review.status !== "confirmed" && review.organization && review.organization.status !== "preparing" && review.claims.length ? <Button type="button" variant="outline" disabled={busy} onClick={() => void organize()}>Organize extracted statements</Button> : !review.organization ? <p className="text-muted-foreground">The connected service needs the review-grouping update before a new grouped selection can be saved.</p> : null}</div> : review.organization?.rationale ? <details className="rounded-md border p-4 text-sm"><summary className="cursor-pointer font-medium">Why these suggestions?</summary><p className="mt-3 whitespace-pre-wrap">{review.organization.rationale}</p></details> : null}
      {(["central_claims", "testable_findings"] as const).map(group => {
        const items = review.claims.filter(claim => roles[claim.id] === group);
        const name = group === "central_claims" ? "Central Claims" : "Testable Findings";
        return <fieldset key={group} className="space-y-3 rounded-lg border p-4" disabled={readOnly}>
          <legend className="px-1 font-semibold">{name}</legend>
          {groupingReady || items.length ? <p className="text-sm">{selectedCount(group)} selected of {items.length} statements.</p> : null}
          {!items.length ? <p className="text-sm text-muted-foreground">{groupingReady ? "No suggested statements." : "Suggestions pending."}</p> : <>
            {!readOnly ? <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => groupSelection(group, true)}>Select all {group === "central_claims" ? "central claims" : "testable findings"}</Button><Button type="button" size="sm" variant="ghost" onClick={() => groupSelection(group, false)}>Clear {group === "central_claims" ? "central claims" : "testable findings"}</Button></div> : null}
            {items.map((claim, index) => <article key={claim.id} className="space-y-3 rounded-md border p-4 text-sm">
              <label className="flex cursor-pointer items-start gap-3"><Checkbox className="mt-1" disabled={readOnly} checked={selected.includes(claim.id)} onCheckedChange={checked => setSelected(previous => checked ? [...new Set([...previous, claim.id])] : previous.filter(id => id !== claim.id))} aria-label={`Assess ${group === "central_claims" ? "central claim" : "testable finding"} ${index + 1}`} /><span className="min-w-0 space-y-2"><span className="block whitespace-pre-wrap break-words">{claim.description}</span><span className="block text-xs text-muted-foreground">{claim.location} · {claim.claim_type}</span></span></label>
              {!readOnly ? <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => move(claim.id, group === "central_claims" ? "testable_findings" : "central_claims")}>Move to {group === "central_claims" ? "testable findings" : "central claims"}</Button><Button type="button" size="sm" variant="ghost" onClick={() => move(claim.id)}>Remove from review list</Button></div> : null}
            </article>)}
          </>}
        </fieldset>;
      })}
      {other.length ? <details open={otherOpen} onToggle={event => setOtherOpen(event.currentTarget.open)} className="space-y-3 rounded-lg border p-4"><summary className="cursor-pointer font-medium">{groupingReady ? "Other extracted statements" : "Extracted statements"} ({other.length})</summary>{otherOpen ? <div className="space-y-3">
        <label className="block space-y-2 text-sm"><span>Find extracted statements</span><Input value={query} maxLength={200} onChange={event => { setQuery(event.target.value); setOtherLimit(20); }} /></label>
        <p className="text-xs text-muted-foreground">Showing {Math.min(otherLimit, matching.length)} of {matching.length} matching statements.</p>
        {matching.slice(0, otherLimit).map(claim => <article key={claim.id} className="space-y-2 rounded-md border p-3 text-sm"><p className="whitespace-pre-wrap break-words">{claim.description}</p><p className="text-xs text-muted-foreground">{claim.location} · {claim.claim_type}{review.status === "confirmed" && selected.includes(claim.id) ? " · Included in the original assessment; category was not recorded." : ""}</p>{!readOnly ? <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => move(claim.id, "central_claims")}>Add to central claims</Button><Button type="button" size="sm" variant="outline" onClick={() => move(claim.id, "testable_findings")}>Add to testable findings</Button></div> : null}</article>)}
        {matching.length > otherLimit ? <Button type="button" variant="outline" size="sm" onClick={() => setOtherLimit(n => n + 20)}>Show more statements</Button> : null}
      </div> : null}</details> : null}
      {review.status === "confirmed" ? <Link className="underline" href={experimentQueuePath(assessmentId)}>View assessment progress</Link> : <>{!review.can_start ? <p role="alert" className="text-sm text-destructive">This paper’s authorization no longer admits work. Review the preparation details in Experiment Queue.</p> : null}<Button type="submit" size="lg" disabled={busy || !review.can_start || selected.length === 0 || !review.organization || selected.some(id => !roles[id]) || !title.trim() || !domain.trim()}>{busy ? "Starting assessment…" : "Confirm and start assessment"}</Button></>}
    </form> : null}
  </section>;
}
