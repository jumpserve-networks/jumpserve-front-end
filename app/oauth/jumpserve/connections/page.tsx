import { notFound, redirect } from "next/navigation";
import { requireGoogleUser } from "@/lib/auth";
import { mcpConfig } from "@/lib/jumpserve-mcp-oauth";
import { revokeConnector } from "@/lib/jumpserve-mcp-store";
import { Button } from "@/app/components/ui/button";

const path = "/oauth/jumpserve/connections";

async function disconnect() {
  "use server";
  const config = mcpConfig();
  if (!config) notFound();
  const user = await requireGoogleUser(path);
  await revokeConnector(user.id, config.resource);
  redirect(`${path}?disconnected=1`);
}

export const metadata = { title: "JumpServe connections", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ disconnected?: string }> }) {
  if (!mcpConfig()) notFound();
  await requireGoogleUser(path);
  return <main className="mx-auto max-w-xl space-y-5 px-4 py-10">
    <h1 className="text-2xl font-semibold">JumpServe connections</h1>
    {(await searchParams).disconnected === "1" && <p role="status">JumpServe clients disconnected.</p>}
    <p>Disconnect Claude Code and Codex from your account. You can reconnect from either client.</p>
    <form action={disconnect}><Button type="submit">Disconnect all clients</Button></form>
  </main>;
}
