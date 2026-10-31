import { createClient } from "@/lib/supabase/server";
import { isGoogleAuthenticatedUser } from "@/lib/auth-provider";
import { parsePlatformControl, platformId } from "@/lib/platform-updates";
import { controlPlatform, readPlatform } from "@/lib/platform-updates-store";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  const client = await createClient(); const { data: { user } } = await client.auth.getUser();
  if (!isGoogleAuthenticatedUser(user)) return Response.json({ error: "Google sign-in is required." }, { status: 401, headers });
  const query = new URL(request.url).searchParams; const task = query.get("task"); const beforeTask = query.get("before_task"); const beforeEvent = query.get("before_event");
  if ([task, beforeTask].some(value => value !== null && !platformId(value)) || (beforeEvent !== null && !/^[0-9]{1,19}$/.test(beforeEvent))) return Response.json({ error: "Invalid platform history cursor." }, { status: 400, headers });
  const result = await readPlatform(client, task, beforeEvent, beforeTask);
  return Response.json(result, { status: result.status === "available" ? 200 : result.status === "forbidden" ? 403 : 503, headers });
}
export async function POST(request: Request) {
  const client = await createClient(); const { data: { user } } = await client.auth.getUser();
  if (!isGoogleAuthenticatedUser(user)) return Response.json({ error: "Google sign-in is required." }, { status: 401, headers });
  const expected = new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url).origin;
  if (request.headers.get("origin") !== expected) return Response.json({ error: "Same-origin platform controls are required." }, { status: 403, headers });
  if (Number(request.headers.get("content-length") || 0) > 20000) return Response.json({ error: "Platform control exceeds its limit." }, { status: 413, headers });
  let body;
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error("Missing platform control.");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 20000) { await reader.cancel(); throw new Error("Platform control exceeds its limit."); } chunks.push(chunk.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = parsePlatformControl(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid platform control." }, { status: 400, headers }); }
  try { return Response.json({ result: await controlPlatform(client, body) }, { headers }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Control request unconfirmed." }, { status: 409, headers }); }
}
