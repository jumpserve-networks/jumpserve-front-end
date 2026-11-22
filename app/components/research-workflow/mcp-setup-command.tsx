"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/app/components/ui/dialog";

const marketplace = "jumpserve-networks/jumpserve-plugins";
const setupClients = [
  {
    name: "Claude Code",
    button: "Add Plugin to Claude",
    command: `claude plugin install jumpserve --marketplace ${marketplace}`,
    signIn: <>from <code>/mcp</code> in Claude Code</>,
  },
  {
    name: "Codex",
    button: "Add Plugin to Codex",
    command: `codex plugin marketplace add ${marketplace} && codex plugin add jumpserve@jumpserve`,
    signIn: <>by running <code>codex mcp login jumpserve</code></>,
  },
];

export function McpSetupDialogs({ connectionsUrl }: { connectionsUrl: string }) {
  return (
    <div className="flex flex-wrap gap-2 border-t pt-4">
      {setupClients.map(client => (
        <Dialog key={client.name}>
          <DialogPrimitive.Trigger render={<Button variant="outline" />}>
            {client.button}
          </DialogPrimitive.Trigger>
          <DialogContent className="content-panel max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto rounded-xl border sm:max-w-xl">
            <div className="space-y-2 pr-8">
              <DialogTitle className="text-lg">Set up JumpServe in {client.name}</DialogTitle>
              <DialogDescription>The plugin bundles the paper assessment skill and hosted JumpServe connector. Use it to assess papers and run experiments in your local workspace.</DialogDescription>
            </div>
            <CopyBlock title="Install command" label={`${client.name} install command`} value={client.command} />
            <p>Connect with Google {client.signIn}. Use the same Google account you used to upload the paper.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-primary underline-offset-4">
              <a className="underline" href={`https://github.com/${marketplace}`}>View the public marketplace and install instructions</a>
              <Link className="underline" href={connectionsUrl}>Manage JumpServe connections</Link>
            </div>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
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
