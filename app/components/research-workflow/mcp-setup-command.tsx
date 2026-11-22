"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";

export function McpSetupCommand({ client, command }: { client: string; command: string }) {
  const [message, setMessage] = useState("");
  const label = `${client} install command`;

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setMessage("Copied.");
    } catch {
      setMessage("Copy failed. Select the command and copy it manually.");
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>{client}</p>
        <div className="flex items-center gap-2">
          <span role="status" className="text-xs text-muted-foreground">{message}</span>
          <Button type="button" size="sm" variant="outline" aria-label={`Copy ${label}`} onClick={copyCommand}>
            Copy
          </Button>
        </div>
      </div>
      <pre tabIndex={0} aria-label={label} className="overflow-x-auto rounded-md bg-muted p-3 text-sm">
        <code>{command}</code>
      </pre>
    </div>
  );
}
