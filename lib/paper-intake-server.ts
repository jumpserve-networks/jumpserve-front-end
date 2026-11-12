import "server-only";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { sha256 } from "./paper-intake-model";
import { preparePaperIntake } from "./paper-intake-service";
import { PAPER_INTAKE_VERSION, paperIntakePending, type PaperIntakeView } from "./paper-intake";
import { cancelPaperIntake, refreshPaperIntake, type IntakeRecord } from "./paper-intake-runner";
import { isGoogleAuthenticatedUser } from "./auth-provider";
import { paperIntakeCredentials } from "./paper-intake-credentials";
import { readWithAssessmentDeletion } from "./assessment-visibility";
import { validatePaperBreakdown } from "./research-paper-breakdown";

export async function intakeConfigured() { return Boolean(await paperIntakeCredentials()); }
export async function intakeDatabase() {
  const key = (await paperIntakeCredentials())?.supabaseSecret;
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("Paper preparation needs a server-side Supabase key.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20_000), cache: "no-store" }) } });
}
export async function modelClient() {
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
  const db = await intakeDatabase();
  const active = await readWithAssessmentDeletion(filterDeleted => {
    const query = db.from("research_studies").select("id").eq("id", id);
    return (filterDeleted ? query.is("deleted_at", null) : query).maybeSingle();
  });
  if (active.error) throw new Error(`Assessment availability could not be checked (database code ${active.error.code || "unknown"}).`);
  if (!active.data) return null;
  let query = db.from("research_paper_intakes").select("*").eq("study_id", id);
  if (actor) query = query.eq("owner_id", actor);
  const { data, error } = await query.maybeSingle();
  if (error && ["PGRST205", "42P01"].includes(error.code)) return null;
  if (error) throw new Error(`Paper status could not be loaded: ${error.message}`);
  return data && actor ? effectiveIntake(data as IntakeRecord, actor) : data as IntakeRecord | null;
}
/** A reviewed overlay never changes the frozen original model call or intake. */
export async function effectiveIntake(row: IntakeRecord, actor: string) {
  if (actor !== row.owner_id || row.status !== "ready" || row.review_revision) return row;
  const { data, error } = await (await intakeDatabase()).from("research_paper_breakdown_reviews").select("revision,breakdown").eq("study_id", row.study_id).eq("owner_id", actor).order("revision", { ascending: false }).limit(1).maybeSingle();
  if (error && ["PGRST205", "42P01"].includes(error.code)) return row;
  if (error) throw new Error(`Reviewed paper evidence could not be loaded (database code ${error.code || "unknown"}).`);
  if (!data) return row;
  const breakdown = validatePaperBreakdown(data.breakdown);
  if (!breakdown.review || breakdown.review.revision !== data.revision || !row.revision || data.revision <= row.revision) throw new Error("The reviewed paper revision could not be verified.");
  return { ...row, breakdown, revision: data.revision, review_revision: data.revision, updated_at: breakdown.review.reviewed_at };
}
async function save(operation: string, row: Pick<IntakeRecord, "study_id" | "owner_id">, payload: Record<string, unknown>) {
  const { data, error } = await (await intakeDatabase()).rpc("research_paper_intake", { p_operation: operation, p_actor: row.owner_id, p_study: row.study_id, p_payload: payload });
  if (operation === "begin" && error?.message === "Bounded one-pass request and retained paper text required") throw new Error("Paper preparation could not start because the app and database preparation settings do not match. No model request was sent. Your uploaded PDF is retained.");
  if (error) throw new Error(`Paper preparation could not be saved: ${error.message}`);
  return data as IntakeRecord & { admitted?: boolean };
}
const operations = () => ({ save, retrieve: async (id: string) => (await modelClient()).responses.retrieve(id), cancel: async (id: string) => (await modelClient()).responses.cancel(id) });
export const refreshIntake = (row: IntakeRecord) => refreshPaperIntake(row, operations());
export const cancelIntake = (row: IntakeRecord) => cancelPaperIntake(row, operations());

export async function intakeView(row: IntakeRecord, actor?: string | null): Promise<PaperIntakeView> {
  const owner = actor === row.owner_id;
  if (owner) row = await effectiveIntake(row, actor!);
  const { count, error } = await (await intakeDatabase()).from("research_queue_jobs").select("id", { count: "exact", head: true }).eq("study_id", row.study_id);
  if (error || count === null) throw new Error("The recorded Experiment Queue could not be checked.");
  return { version: PAPER_INTAKE_VERSION, id: row.study_id, status: row.status === "ready" ? "ready" : paperIntakePending(row.status) ? "preparing" : "failed", review_version: "research-paper-review-v1", stage: row.status,
    title: owner ? row.title : null, authors: owner ? row.authors : null, domain: owner ? row.domain : null,
    created_at: row.created_at, updated_at: row.updated_at, reason: owner ? row.reason : null, breakdown: owner ? row.breakdown as PaperIntakeView["breakdown"] : null, owner, experiment_jobs: count };
}
export async function reserveIntake(actor: string, id: string, metadata: Record<string, unknown>) {
  if (!await intakeConfigured()) throw new Error("Configure the server-side OpenAI and Supabase keys before uploading a paper.");
  const row = await save("reserve", { study_id: id, owner_id: actor }, metadata);
  if (!await loadIntake(id, actor)) throw new Error("Assessment not found.");
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
  return preparePaperIntake(row, {
    ...operations(), retainArtifact: retainedArtifact,
    readOriginal: async current => {
      const { data, error } = await (await intakeDatabase()).storage.from("research-paper-uploads").download(`${current.study_id}/${current.sha256}`);
      if (error || !data) throw new Error("The private PDF upload is unavailable. Retry with the original file and request ID.");
      return new Uint8Array(await data.arrayBuffer());
    },
    create: (request, token) => model.responses.create(request, { headers: { "X-Client-Request-Id": token } }),
  });
}

export async function ownerIntakes(actor: string) {
  const db = await intakeDatabase();
  const owned = await readWithAssessmentDeletion(filterDeleted => {
    const query = db.from("research_study_owners").select("study_id,active_study:research_studies!inner(id)").eq("owner_id", actor).limit(1000);
    return filterDeleted ? query.is("active_study.deleted_at", null) : query;
  });
  if (owned.error) throw new Error("Owned paper list could not be loaded.");
  if (!owned.data.length) return { access: "owner-drafts", studies: [] };
  const ids = owned.data.map(item => item.study_id);
  const [studies, reviews, intakes, intakeStatuses] = await Promise.all([readWithAssessmentDeletion(filterDeleted => {
    const query = db.from("research_studies").select("id,title,study_kind,created_at").in("id", ids).order("created_at", { ascending: false });
    return filterDeleted ? query.is("deleted_at", null) : query;
  }), db.from("research_paper_reviews").select("study_id,status,title").in("study_id", ids), db.from("research_paper_intakes").select("*").eq("owner_id", actor).in("study_id", ids).in("status", ["submitting", "processing"]).order("updated_at").limit(3), db.from("research_paper_intakes").select("study_id,status,title,reason").eq("owner_id", actor).in("study_id", ids).limit(1000)]);
  if (studies.error || reviews.error || [intakes.error, intakeStatuses.error].some(error => error && !["PGRST205", "42P01"].includes(error.code))) throw new Error("Paper notification status could not be loaded.");
  const recorded = (intakeStatuses.data ?? []) as Pick<IntakeRecord, "study_id" | "status" | "title" | "reason">[];
  const refreshed = await Promise.all(((intakes.data ?? []) as IntakeRecord[]).map(refreshIntake));
  return { access: "owner-drafts", studies: studies.data.map(study => {
    const review = reviews.data.find(r => r.study_id === study.id);
    const current = refreshed.find(r => r.study_id === study.id) ?? recorded.find(r => r.study_id === study.id);
    const status = review?.status === "confirmed" ? "confirmed" : current ? current.status === "ready" ? "ready" : paperIntakePending(current.status) ? "preparing" : "failed" : review?.status;
    return { ...study, title: current?.title ?? review?.title ?? study.title, ...(status ? { paper_review_status: status } : {}), ...(current ? { paper_intake_stage: current.status, paper_intake_reason: current.reason } : {}) };
  }) };
}
