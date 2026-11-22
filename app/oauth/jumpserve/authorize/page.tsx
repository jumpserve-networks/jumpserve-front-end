import { notFound, redirect } from "next/navigation";
import { requireGoogleUser } from "@/lib/auth";
import { mcpConfig, MCP_AUTHORIZE_PATH, parseAuthorizationRequest } from "@/lib/jumpserve-mcp-oauth";
import { createAuthorizationCode, resolveMcpClient } from "@/lib/jumpserve-mcp-store";
import { Button } from "@/app/components/ui/button";

async function parseConsent(query: URLSearchParams, resource: string) {
  return parseAuthorizationRequest(query, resource, await resolveMcpClient(query.get("client_id"), resource));
}

async function authorize(values: string, form: FormData) {
  "use server";
  const config = mcpConfig();
  const details = config && await parseConsent(new URLSearchParams(values), config.resource);
  if (!config || !details) notFound();
  const user = await requireGoogleUser(`${MCP_AUTHORIZE_PATH}?${values}`);
  const callback = new URL(details.redirectUri);
  callback.searchParams.set("state", details.state);
  if (form.get("decision") === "allow") {
    callback.searchParams.set("code", await createAuthorizationCode(user.id, details, config.resource));
  } else {
    callback.searchParams.set("error", "access_denied");
  }
  redirect(callback.toString());
}

export const metadata = { title: "Connect JumpServe", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function AuthorizePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const config = mcpConfig();
  if (!config) notFound();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
    if (Array.isArray(value)) value.forEach(item => query.append(key, item));
  }
  const details = await parseConsent(query, config.resource);
  if (!details) notFound();
  const values = query.toString();
  await requireGoogleUser(`${MCP_AUTHORIZE_PATH}?${values}`);
  return <main className="mx-auto max-w-xl space-y-5 px-4 py-10">
    <h1 className="text-2xl font-semibold">Connect {details.clientName} to JumpServe</h1>
    <p>This connection can send assessment previews and submit assessments you approve on JumpServe.</p>
    {details.readSources ? <p>It can also download private research PDFs you uploaded to Step 1 when you give the client the assessment ID.</p> : null}
    <form className="flex gap-3" action={authorize.bind(null, values)}>
      <Button type="submit" name="decision" value="allow">Connect</Button>
      <Button type="submit" name="decision" value="deny" variant="outline">Decline</Button>
    </form>
  </main>;
}
