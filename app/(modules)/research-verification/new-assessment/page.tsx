import { ResearchHeader } from "@/app/components/research-workflow/header";
import Link from "next/link";
import { ASSESSMENTS_PATH } from "@/lib/test-modules";

export const dynamic = "force-dynamic";

export default function NewAssessment() {
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6"><ResearchHeader title="Local Paper Assessments" /><section className="content-panel space-y-4 rounded-xl border p-6">
    <p>Paper assessment and experiment execution are moving to a local Claude Code or Codex skill. Hosted assessment generation has been retired.</p>
    <p>The public skill package and optional assessment upload are being prepared. Existing assessments and research results remain available.</p>
    <Link href={ASSESSMENTS_PATH} className="text-primary underline underline-offset-4">View saved assessments</Link>
  </section></main>;
}
