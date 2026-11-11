import "server-only";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";
import { PAPER_INTAKE_MAX_PAGES, PAPER_INTAKE_MODEL, PAPER_INTAKE_RESERVATION_CENTS, paperModelRequest, sha256 } from "./paper-intake-model";
import { PAPER_INTAKE_VERSION, paperIntakePending, type PaperIntakeView } from "./paper-intake";
import { cancelPaperIntake, refreshPaperIntake, type IntakeRecord } from "./paper-intake-runner";
import { isGoogleAuthenticatedUser } from "./auth-provider";
import { paperIntakeCredentials } from "./paper-intake-credentials";

export async function intakeConfigured() { return Boolean(await paperIntakeCredentials()); }
export async function intakeDatabase() {
  const key = (await paperIntakeCredentials())?.supabaseSecret;
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("Paper preparation needs a server-side Supabase key.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20_000), cache: "no-store" }) } });
}
async function modelClient() {
  const key = (await paperIntakeCredentials())?.openaiApiKey;
  if (!key) throw new Error("Paper preparation needs OPENAI_API_KEY on the server.");
  return new OpenAI({ apiKey: key, maxRetries: 0, timeout: 25_000 });
}
export async function intakeActor(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return null;
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return !error && isGoogleAuthenticatedUser(data.user) ? data.user!.id : null;
}
export async function loadIntake(id: string, actor?: string | null) {
  let query = (await intakeDatabase()).from("research_paper_intakes").select("*").eq("study_id", id);
  if (actor) query = query.eq("owner_id", actor);
  const { data, error } = await query.maybeSingle();
  if (error && ["PGRST205", "42P01"].includes(error.code)) return null;
  if (error) throw new Error(`Paper status could not be loaded: ${error.message}`);
  return data as IntakeRecord | null;
}
async function save(operation: string, row: Pick<IntakeRecord, "study_id" | "owner_id">, payload: Record<string, unknown>) {
  const { data, error } = await (await intakeDatabase()).rpc("research_paper_intake", { p_operation: operation, p_actor: row.owner_id, p_study: row.study_id, p_payload: payload });
  if (error) throw new Error(`Paper preparation could not be saved: ${error.message}`);
  return data as IntakeRecord & { admitted?: boolean };
}
const operations = () => ({ save, retrieve: async (id: string) => (await modelClient()).responses.retrieve(id), cancel: async (id: string) => (await modelClient()).responses.cancel(id) });
export const refreshIntake = (row: IntakeRecord) => refreshPaperIntake(row, operations());
export const cancelIntake = (row: IntakeRecord) => cancelPaperIntake(row, operations());

export async function intakeView(row: IntakeRecord, actor?: string | null): Promise<PaperIntakeView> {
  const owner = actor === row.owner_id;
  const { count, error } = await (await intakeDatabase()).from("research_queue_jobs").select("id", { count: "exact", head: true }).eq("study_id", row.study_id);
  if (error || count === null) throw new Error("The recorded Experiment Queue could not be checked.");
  return { version: PAPER_INTAKE_VERSION, id: row.study_id, status: row.status === "ready" ? "ready" : paperIntakePending(row.status) ? "preparing" : "failed", review_version: "research-paper-review-v1", stage: row.status,
    title: owner ? row.title : null, authors: owner ? row.authors : null, domain: owner ? row.domain : null,
    created_at: row.created_at, updated_at: row.updated_at, reason: owner ? row.reason : null, breakdown: owner ? row.breakdown as PaperIntakeView["breakdown"] : null, owner, experiment_jobs: count };
}
export async function reserveIntake(actor: string, id: string, metadata: Record<string, unknown>) {
  if (!await intakeConfigured()) throw new Error("Configure the server-side OpenAI and Supabase keys before uploading a paper.");
  const row = await save("reserve", { study_id: id, owner_id: actor }, metadata);
  if (row.status !== "uploaded") return { version: "research-paper-upload-v2", id, status: "started", result: await intakeView(row, actor) };
  const path = `${id}/${row.sha256}`;
  const { data, error } = await (await intakeDatabase()).storage.from("research-paper-uploads").createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new Error("Private PDF upload permission could not be created.");
  return { version: "research-paper-upload-v2", id, status: "pending", bucket: "research-paper-uploads", path, token: data.token, sha256: row.sha256, byte_count: row.byte_count, maximum_bytes: 10_000_000 };
}
async function retainedArtifact(row: IntakeRecord, id: string, bytes: Uint8Array, mediaType: string, kind: string) {
  const hash = sha256(bytes), path = `${row.study_id}/${hash}`, storage = (await intakeDatabase()).storage.from("research-workflow-raw");
  const { error } = await storage.upload(path, bytes, { contentType: mediaType, upsert: false });
  if (error) {
    const existing = await storage.download(path);
    if (existing.error || !existing.data || sha256(new Uint8Array(await existing.data.arrayBuffer())) !== hash) throw new Error("The original paper evidence could not be retained and verified.");
  }
  return { id, sha256: hash, byte_count: bytes.length, storage_path: path, media_type: mediaType, provenance: { kind, version: PAPER_INTAKE_VERSION, original_sha256: row.sha256 } };
}
export async function prepareIntake(row: IntakeRecord) {
  if (row.status !== "uploaded") return refreshIntake(row);
  const model = await modelClient();
  let admitted: Awaited<ReturnType<typeof save>>;
  try {
    const { data, error } = await (await intakeDatabase()).storage.from("research-paper-uploads").download(`${row.study_id}/${row.sha256}`);
    if (error || !data) throw new Error("The private PDF upload is unavailable. Retry with the original file and request ID.");
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.length !== row.byte_count || sha256(bytes) !== row.sha256 || !new TextDecoder().decode(bytes.slice(0, 1024)).trimStart().startsWith("%PDF-")) throw new Error("The stored PDF does not match the original upload identity.");
    const pdf = await getDocumentProxy(bytes.slice(), { enableXfa: false, disableFontFace: true, stopAtErrors: true, maxImageSize: 1_000_000 });
    let paper;
    try {
      if (pdf.numPages > PAPER_INTAKE_MAX_PAGES) throw new Error("Phase one accepts up to 200 PDF pages.");
      const extracted = await extractText(pdf, { mergePages: false });
      paper = { totalPages: extracted.totalPages, pages: extracted.text.map((text, index) => ({ page: index + 1, text })) };
    } finally { await pdf.loadingTask.destroy(); }
    const request = paperModelRequest(paper);
    const artifacts = [await retainedArtifact(row, row.original_artifact_id, bytes, "application/pdf", "paper-original-upload"), await retainedArtifact(row, row.text_artifact_id, new TextEncoder().encode(JSON.stringify(paper)), "application/json", "paper-text-extraction")];
    admitted = await save("begin", row, { model_id: PAPER_INTAKE_MODEL, request, paper_text: paper, artifacts, reserved_cents: PAPER_INTAKE_RESERVATION_CENTS });
  } catch (error) {
    // Input/storage failures happen before admission, so a byte-identical retry is safe.
    throw error;
  }
  if (!admitted.admitted) return admitted;
  let response;
  try { response = await model.responses.create(paperModelRequest(admitted.paper_text!), { headers: { "X-Client-Request-Id": admitted.submit_token! } }); }
  catch (error) {
    if (error instanceof OpenAI.APIError && error.status && error.status >= 400 && error.status < 500 && ![408, 409].includes(error.status)) {
      return save("failed", admitted, { token: admitted.submit_token, response: { status: error.status, request_id: error.requestID }, reason: `OpenAI rejected the paper request (HTTP ${error.status}). Check the server's model access, API key and quota. The request will not be submitted again automatically.` });
    }
    return save("uncertain", admitted, { token: admitted.submit_token, reason: "The original OpenAI submission was not confirmed. It will not be submitted again automatically; reconcile the retained request identity before any replacement." });
  }
  // Retry acknowledgement only. Never retry the model request after a lost DB response.
  const payload = { token: admitted.submit_token, response_id: response.id, response };
  try { return await save("submitted", admitted, payload); }
  catch { return save("submitted", admitted, payload); }
}

export async function ownerIntakes(actor: string) {
  const db = await intakeDatabase();
  const owned = await db.from("research_study_owners").select("study_id").eq("owner_id", actor).limit(1000);
  if (owned.error) throw new Error("Owned paper list could not be loaded.");
  if (!owned.data.length) return { access: "owner-drafts", studies: [] };
  const ids = owned.data.map(item => item.study_id);
  const [studies, reviews, intakes] = await Promise.all([db.from("research_studies").select("id,title,study_kind,created_at").in("id", ids).order("created_at", { ascending: false }), db.from("research_paper_reviews").select("study_id,status,title").in("study_id", ids), db.from("research_paper_intakes").select("*").eq("owner_id", actor).in("status", ["submitting", "processing"]).order("updated_at").limit(3)]);
  if (studies.error || reviews.error || intakes.error && !["PGRST205", "42P01"].includes(intakes.error.code)) throw new Error("Paper notification status could not be loaded.");
  const refreshed = await Promise.all(((intakes.data ?? []) as IntakeRecord[]).map(refreshIntake));
  return { access: "owner-drafts", studies: studies.data.map(study => { const review = reviews.data.find(r => r.study_id === study.id), current = refreshed.find(r => r.study_id === study.id); return { ...study, title: current?.title ?? review?.title ?? study.title, ...(review ? { paper_review_status: current ? current.status === "ready" ? "ready" : paperIntakePending(current.status) ? "preparing" : "failed" : review.status } : {}) }; }) };
}
