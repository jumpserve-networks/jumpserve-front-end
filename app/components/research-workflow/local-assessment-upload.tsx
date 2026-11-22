"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { requireAccessToken } from "@/lib/browser-auth";
import { LOCAL_ASSESSMENT_SOURCE_API, localAssessmentSourcePage, PAPER_UPLOAD_BUCKET, type LocalAssessmentSource } from "@/lib/local-assessment-source";
import { paperUploadMetadata } from "@/lib/research-paper-upload";
import { createClient } from "@/lib/supabase/client";

async function requestSource(action: "reserve" | "verify", assessmentId: string, { sha256, byte_count }: LocalAssessmentSource, token: string) {
  const response = await fetch(LOCAL_ASSESSMENT_SOURCE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, assessment_id: assessmentId, sha256, byte_count }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error ?? "JumpServe could not upload the PDF. Try again.");
  return result;
}

export function LocalAssessmentUpload({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const [pendingNavigation, startNavigation] = useTransition();
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const reservation = useRef<{ id: string; sha256: string } | null>(null);
  const busy = Boolean(progress) || pendingNavigation;

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setProgress("Checking PDF…");
    try {
      const file = new FormData(event.currentTarget).get("paper");
      if (!(file instanceof File)) throw new Error("Choose a PDF to upload.");
      const metadata = await paperUploadMetadata(file);
      const assessmentId = reservation.current?.sha256 === metadata.sha256 ? reservation.current.id : crypto.randomUUID();
      reservation.current = { id: assessmentId, sha256: metadata.sha256 };
      const token = await requireAccessToken("Sign in with Google to upload a paper.", ownerId);
      const ticket = await requestSource("reserve", assessmentId, metadata, token);
      let uploadError: string | undefined;
      if (ticket.status === "pending") {
        setProgress("Uploading PDF…");
        try {
          const pdf = file.slice(0, file.size, "application/pdf");
          const { error } = await createClient().storage.from(PAPER_UPLOAD_BUCKET)
            .uploadToSignedUrl(ticket.path, ticket.token, pdf, { contentType: "application/pdf", upsert: false });
          uploadError = error?.message;
        } catch {
          uploadError = "Could not reach private PDF storage.";
        }
      }
      setProgress("Verifying PDF…");
      try {
        // A lost response or simultaneous upload can still leave the exact PDF in storage.
        await requestSource("verify", assessmentId, metadata, token);
      } catch (error) {
        throw uploadError ? new Error(`PDF upload could not be confirmed. ${uploadError}`) : error;
      }
      startNavigation(() => router.replace(localAssessmentSourcePage(assessmentId), { scroll: false }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "JumpServe could not upload the PDF. Try again.");
    } finally {
      setProgress("");
    }
  }

  return (
    <form onSubmit={upload} className="max-w-xl space-y-3">
      <label htmlFor="assessment-source-pdf" className="text-sm font-medium">Research paper PDF</label>
      <Input id="assessment-source-pdf" name="paper" type="file" accept=".pdf,application/pdf" required disabled={busy} aria-describedby="assessment-source-hint" />
      <p id="assessment-source-hint" className="text-sm text-muted-foreground">Up to 10 MB. Your upload is private.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>Upload PDF</Button>
        <span role="status" className="text-sm text-muted-foreground">{progress || (pendingNavigation ? "Opening prompt…" : "")}</span>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
