import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { STUDY_DOI } from "@/lib/delay-study";
import { DELAY_STUDY_MODULE_PATH } from "@/lib/test-modules";

export function StudyHeader({ title, description }: { title: string; description: string }) {
  return <header className="mb-7 space-y-3">
    <Link href={`${DELAY_STUDY_MODULE_PATH}/test-results`} className="text-xs font-medium uppercase tracking-widest text-muted-foreground">NINeS 2026 · independent reproduction</Link>
    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
    <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
    <div className="flex flex-wrap items-center gap-4">
      <a href={STUDY_DOI} target="_blank" rel="noreferrer" className="inline-block text-sm text-primary underline underline-offset-4">Making Congestion Control Algorithms Insensitive to Underlying Propagation Delays ↗</a>
      <Button variant="outline" size="sm" nativeButton={false} render={<a href={`${DELAY_STUDY_MODULE_PATH}/data`} />}>Download study summary (JSON)</Button>
    </div>
  </header>;
}
