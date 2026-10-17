import { RESEARCH_IDEAS_MODULE, RESEARCH_VERIFICATION_MODULE } from "@/lib/test-modules";
import type { ResearchStudyKind } from "@/lib/research-pathways";

export function ResearchHeader({ title, description, kind = "paper", showModuleLabel = true }: { title: string; description?: string; kind?: ResearchStudyKind; showModuleLabel?: boolean }) {
  const testModule = kind === "idea" ? RESEARCH_IDEAS_MODULE : RESEARCH_VERIFICATION_MODULE;
  return <header className="space-y-3">{showModuleLabel ? <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{testModule.name}</p> : null}<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{description ? <p className="max-w-4xl text-sm text-muted-foreground">{description}</p> : null}</header>;
}
