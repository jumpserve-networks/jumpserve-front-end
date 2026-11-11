"use client";

import { useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/app/components/ui/alert-dialog";
import { deleteAssessment } from "@/lib/research-assessment-delete";

export function DeleteAssessment({ id, title, userId, onDeleted }: { id: string; title: string; userId: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  async function remove() {
    if (submitting.current) return;
    submitting.current = true; setPending(true); setError("");
    try { await deleteAssessment(id, userId); setOpen(false); onDeleted(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Deletion could not be confirmed. Refresh the list before trying again."); }
    finally { submitting.current = false; setPending(false); }
  }
  return <AlertDialog open={open} onOpenChange={value => { setOpen(value); if (!submitting.current) setError(""); }}>
    <AlertDialogTrigger render={<Button variant="outline" size="sm" className="relative z-10 text-destructive" aria-label={`Delete assessment: ${title}`} />}>Delete</AlertDialogTrigger>
    <AlertDialogContent aria-busy={pending}>
      <AlertDialogHeader><AlertDialogTitle>Delete this assessment?</AlertDialogTitle><AlertDialogDescription>
        “{title}” will disappear from assessment lists and shared links. This cannot be undone. Research evidence and audit history remain privately retained. Stop any running work before deleting.
      </AlertDialogDescription></AlertDialogHeader>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <AlertDialogFooter><AlertDialogCancel>{pending ? "Close" : "Keep assessment"}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={() => void remove()}>{pending ? "Deleting…" : "Delete assessment"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
