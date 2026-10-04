import Link from "next/link";
import { LEO_STUDY_MODULE_PATH } from "@/lib/test-modules";
export function LeoHeader({ title, description }: { title: string; description: string }) {
  return <header className="mb-6 space-y-3">
    <Link className="text-sm text-muted-foreground hover:text-primary" href={LEO_STUDY_MODULE_PATH}>LEO Emergency Failover Study</Link>
    <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
    <p className="max-w-4xl text-sm text-muted-foreground">{description}</p>
    <nav aria-label="Study pages" className="flex flex-wrap gap-4 text-sm">
      {[ ["test-results", "Results"], ["methods", "Methods & claims"], ["literature", "Literature"], ["chat", "Chat with AI"] ].map(([path, label]) => <Link key={path} className="underline underline-offset-4 hover:text-primary" href={`${LEO_STUDY_MODULE_PATH}/${path}`}>{label}</Link>)}
    </nav>
  </header>;
}
