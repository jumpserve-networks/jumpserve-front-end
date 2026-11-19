import { NextResponse } from "next/server";
import { paperIntakeCredentials } from "@/lib/paper-intake-credentials";
import { verifyPaperBackgroundSignature } from "@/lib/paper-background-auth";
import { continuePaperBackground } from "@/lib/paper-background-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  try {
    if (new URL(request.url).search || !request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "A bounded signed continuation request is required." }, 400);
    const body = await request.text();if (Buffer.byteLength(body) > 128) return json({ error: "Continuation request too large." }, 413);
    const credentials = await paperIntakeCredentials();
    if (!credentials || !verifyPaperBackgroundSignature(request.headers, credentials.openaiApiKey, body)) return json({ error: "Invalid continuation signature." }, 401);
    let value;try { value = JSON.parse(body); } catch { return json({ error: "Invalid continuation JSON." }, 400); }
    if (!value || Object.keys(value).join(",") !== "limit" || !Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 2) return json({ error: "Choose a bounded continuation batch." }, 400);
    return json(await continuePaperBackground(value.limit));
  } catch { return json({ error: "Paper continuation is temporarily unavailable. Original work is retained." }, 503); }
}
