"use client";
import { Button } from "@/app/components/ui/button";
export default function StudyError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-5xl space-y-4 px-6 py-10"><h1 className="text-2xl font-semibold">Study data could not be loaded</h1><p className="text-sm text-muted-foreground">The measurement database is unavailable or returned an incomplete response. Existing evidence has not been changed.</p><Button variant="outline" onClick={reset}>Try again</Button></main>;
}
