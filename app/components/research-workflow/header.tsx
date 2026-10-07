import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { RESEARCH_WORKFLOW_MODULE_PATH as PATH } from "@/lib/test-modules";
export function ResearchHeader({ title, description }: { title: string; description: string }) {
  return <header className="space-y-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Research Verification</p><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="max-w-4xl text-sm text-muted-foreground">{description}</p><nav className="flex flex-wrap gap-2" aria-label="Research workflow">{[["test-results", "Published assessments"], ["new-study", "Assess a paper"], ["workspace", "My studies"], ["methods", "Workflow & methods"]].map(([path, label]) => <Button key={path} size="sm" variant="outline" render={<Link href={`${PATH}/${path}`} />} nativeButton={false}>{label}</Button>)}</nav></header>;
}
