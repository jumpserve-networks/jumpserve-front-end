"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Input } from "@/app/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { LocalDateTime } from "@/app/components/user-preferences";
import { promptArea, promptPath, promptStatus, type PromptSummary } from "@/lib/prompts";

export function Prompts({ prompts }: { prompts: PromptSummary[] }) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const areas = [...new Set(prompts.map(prompt => prompt.module_id))].sort((a, b) => promptArea(a).localeCompare(promptArea(b)));
  const search = query.trim().toLowerCase();
  const visible = prompts.filter(prompt => (!area || prompt.module_id === area) && (!status || promptStatus(prompt) === status) &&
    `${promptArea(prompt.module_id)} ${prompt.module_id} ${prompt.version}`.toLowerCase().includes(search))
    .sort((a, b) => promptArea(a.module_id).localeCompare(promptArea(b.module_id)) || Number(b.active) - Number(a.active) || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
  return <>
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
      <label className="space-y-1 text-sm"><span>Search prompts</span><Input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Area or version" /></label>
      <div className="min-w-0 space-y-1 text-sm"><span id="prompt-area-label">Area</span><Select value={area} onValueChange={value => setArea(value ?? "")} items={[{ value: "", label: "All areas" }, ...areas.map(value => ({ value, label: promptArea(value) }))]}><SelectTrigger aria-labelledby="prompt-area-label" className="w-full sm:max-w-72"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="">All areas</SelectItem>{areas.map(item => <SelectItem key={item} value={item}>{promptArea(item)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1 text-sm"><span id="prompt-status-label">Status</span><Select value={status} onValueChange={value => setStatus(value ?? "")}><SelectTrigger aria-labelledby="prompt-status-label" className="w-full"><SelectValue>{status || "All versions"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="">All versions</SelectItem>{["Active", "Published", "Draft", "Recorded"].map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{visible.length} {visible.length === 1 ? "version" : "versions"}</p>
    {visible.length ? <div className="content-panel divide-y rounded-lg border">{visible.map(prompt => <article key={prompt.id} className="relative flex flex-wrap items-center justify-between gap-3 p-4 focus-within:ring-2 focus-within:ring-ring">
      <div className="min-w-0 space-y-1"><p className="text-sm text-muted-foreground">{promptArea(prompt.module_id)}</p><h2 className="break-words font-medium"><Link href={promptPath(prompt.id)} prefetch={false} className="underline after:absolute after:inset-0">{prompt.version}</Link></h2><p className="text-xs text-muted-foreground">Updated <LocalDateTime value={prompt.updated_at} /></p></div>
      <Badge variant={prompt.active ? "default" : "secondary"}>{promptStatus(prompt)}</Badge>
    </article>)}</div> : <p className="content-panel rounded-lg border p-5 text-sm">{prompts.length ? "No prompts match these filters." : "No saved prompts yet."}</p>}
  </>;
}
