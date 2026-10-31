import { createClient } from "@/lib/supabase/server";
import { isGoogleAuthenticatedUser } from "@/lib/auth-provider";
import { platformId } from "@/lib/platform-updates";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" }; const { id } = await params;
  if (!platformId(id)) return Response.json({ error: "Invalid artifact identity." }, { status: 400, headers });
  const client = await createClient(); const { data: { user } } = await client.auth.getUser();
  if (!isGoogleAuthenticatedUser(user)) return Response.json({ error: "Google sign-in is required." }, { status: 401, headers });
  const { data, error } = await client.rpc("platform_artifact_location", { p_id: id });
  if (error || !data || typeof data.path !== "string" || !Number.isSafeInteger(data.byte_count) || data.byte_count < 0 || data.byte_count > 5000000) return Response.json({ error: "Artifact is unavailable to this account." }, { status: error?.code === "42501" ? 403 : 404, headers });
  const { data: bytes, error: downloadError } = await client.storage.from("platform-supervisor-private").download(data.path);
  if (downloadError || !bytes || bytes.size !== data.byte_count) return Response.json({ error: "Original artifact download is unconfirmed." }, { status: 503, headers });
  const buffer = await bytes.arrayBuffer(); const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))).map(value => value.toString(16).padStart(2, "0")).join("");
  if (hash !== data.sha256) return Response.json({ error: "Original artifact hash differs; retained metadata is unchanged." }, { status: 503, headers });
  const filename = String(data.name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160);
  return new Response(buffer, { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${filename}"`, "X-Content-Type-Options": "nosniff", "X-Artifact-SHA256": hash } });
}
