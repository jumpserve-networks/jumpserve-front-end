import { NextResponse } from "next/server";
import OpenAI from "openai";
import { intakeActor } from "@/lib/paper-intake-server";
import { advanceOwnerPaperQuality, PaperQualityError } from "@/lib/paper-quality-server";
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
/** Only saved owner scope can continue; callers supply no identity, drafts,
 * prompts, model choices, budgets or review decisions. GET cannot admit calls. */
export async function POST(request: Request) {
  try {
    const owner = await intakeActor(request);
    if (!owner) return json({ error: "Sign in with Google to continue saved paper quality checks." }, 401);
    if (new URL(request.url).search || !request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "A bounded JSON continuation request is required." }, 400);
    const raw = await request.text();if (Buffer.byteLength(raw) > 128) return json({ error: "The continuation request is too large." }, 413);
    let body;try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON request." }, 400); }
    if (!body || Object.keys(body).join(",") !== "cursor" || !Number.isSafeInteger(body.cursor) || body.cursor < 0 || body.cursor > 9000) return json({ error: "Choose a valid saved-review cursor." }, 400);
    return json(await advanceOwnerPaperQuality(owner, body.cursor));
  } catch (error) {
    if (error instanceof PaperQualityError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof OpenAI.APIError ? "The original quality call could not be checked (HTTP " + (error.status ?? "unavailable") + "). Its saved identity is retained." : "Paper quality checks are temporarily unavailable. Saved calls are retained." }, 503);
  }
}
