import { after, NextResponse } from "next/server";
import OpenAI from "openai";
import { paperIntakeCredentials } from "@/lib/paper-intake-credentials";
import { continuePaperBackground, enqueuePaperProvider } from "@/lib/paper-background-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  try {
    if (new URL(request.url).search) return json({ error: "Invalid webhook request." }, 400);
    const payload = await request.text();if (Buffer.byteLength(payload) > 128_000) return json({ error: "Webhook too large." }, 413);
    const credentials = await paperIntakeCredentials();
    if (!credentials?.openaiWebhookSecret) return json({ error: "Paper webhook verification is not configured." }, 503);
    const client = new OpenAI({ apiKey: credentials.openaiApiKey, maxRetries: 0 });
    try { await client.webhooks.verifySignature(payload, request.headers, credentials.openaiWebhookSecret); }
    catch { return json({ error: "Invalid webhook signature." }, 401); }
    let event;try { event = JSON.parse(payload); } catch { return json({ error: "Invalid webhook JSON." }, 400); }
    const accepted = ["response.completed", "response.failed", "response.incomplete", "response.cancelled", "agent.session.created", "agent.session.action_required", "agent.session.in_progress", "agent.session.idle", "agent.session.failed"];
    if (!accepted.includes(event?.type)) return json({ accepted: true });
    const id = event.data?.id;
    if (typeof id !== "string" || !/^(resp_|sess_)[A-Za-z0-9_-]{1,200}$/.test(id)) return json({ error: "Invalid provider identity." }, 400);
    await enqueuePaperProvider(id); // Durable before acknowledging; duplicates coalesce.
    after(async () => { try { await continuePaperBackground(2); } catch { /* Scheduled reconciliation remains authoritative. */ } });
    return json({ accepted: true }, 202);
  } catch { return json({ error: "Webhook continuation could not be retained. Retry the same event." }, 503); }
}
