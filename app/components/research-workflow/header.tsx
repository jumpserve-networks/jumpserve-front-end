import { RESEARCH_IDEAS_MODULE, RESEARCH_VERIFICATION_MODULE } from "@/lib/test-modules";
import type { ResearchStudyKind } from "@/lib/research-pathways";
import type { ReactNode } from "react";

export function ResearchHeader({ title, description, kind = "paper", showModuleLabel = true, actions }: { title: string; description?: string; kind?: ResearchStudyKind; showModuleLabel?: boolean; actions?: ReactNode }) {
  const testModule = kind === "idea" ? RESEARCH_IDEAS_MODULE : RESEARCH_VERIFICATION_MODULE;
  return <header className="space-y-3">{showModuleLabel ? <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{testModule.name}</p> : null}<div className="flex items-start justify-between gap-3"><h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">{title}</h1>{actions}</div>{description ? <p className="max-w-4xl text-sm text-muted-foreground">{description}</p> : null}</header>;
}
