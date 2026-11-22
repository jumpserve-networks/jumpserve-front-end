"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";

export function McpSetupCommand({ client, command }: { client: string; command: string }) {
  return <CopyBlock title={client} label={`${client} install command`} value={command} />;
}

export function CopyBlock({ title, label, value, wrap = false }: { title: string; label: string; value: string; wrap?: boolean }) {
  const [message, setMessage] = useState("");

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied.");
    } catch {
      setMessage("Copy failed. Select the text and copy it manually.");
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>{title}</p>
        <div className="flex items-center gap-2">
          <span role="status" className="text-xs text-muted-foreground">{message}</span>
          <Button type="button" size="sm" variant="outline" aria-label={`Copy ${label}`} onClick={copyCommand}>
            Copy
          </Button>
        </div>
      </div>
      <pre tabIndex={0} aria-label={label} className={wrap ? "whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-sans text-sm" : "overflow-x-auto rounded-md bg-muted p-3 text-sm"}>
        {wrap ? value : <code>{value}</code>}
      </pre>
    </div>
  );
}
