import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createStaticClient } from "@/lib/supabase/server";
import { paperIntakeCredentials } from "@/lib/paper-intake-credentials";
import { prepareAssessmentBundle, type AssessmentBundle } from "@/lib/jumpserve-assessment-bundle";
import { clientInfo, credentialHash, isRegisteredClientId, opaqueCredential } from "@/lib/jumpserve-mcp-oauth";

export async function connectorServiceKey() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY ||
    (await paperIntakeCredentials())?.supabaseSecret;
  if (!key) throw new Error("JumpServe sharing is unavailable.");
  return key;
}

export async function resolveMcpClient(id: string | null, resource: string) {
  return clientInfo(id, resource, isRegisteredClientId(id) ? await connectorServiceKey() : undefined);
}

async function serviceDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("JumpServe sharing is unavailable.");
  return createClient(url, await connectorServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store", signal: AbortSignal.timeout(10000) }) },
  });
}

const paperBucket = "research-paper-uploads";
const paperObject = (id: string) => `jumpserve-mcp/${id}.pdf`;

async function verifiedPdf(db: Awaited<ReturnType<typeof serviceDatabase>>, owner: string, id: string) {
  const { data, error } = await db.from("research_skill_submissions")
    .select("pdf_verified_at").eq("owner_id", owner).eq("id", id).maybeSingle();
  if (error) throw new Error("JumpServe could not check the PDF upload.");
  return typeof data?.pdf_verified_at === "string";
}

async function preparePdfUpload(db: Awaited<ReturnType<typeof serviceDatabase>>, owner: string, id: string, hash: string, paper: AssessmentBundle["paper"]) {
  if (await verifiedPdf(db, owner, id)) return undefined;
  const storage = db.storage.from(paperBucket);
  const path = paperObject(id);
  const { data: exists } = await storage.exists(path).catch(() => {
    throw new Error("JumpServe could not check the PDF upload.");
  });
  if (!exists) {
    const { data: expired } = await db.rpc("research_skill_expired_pdfs");
    if (Array.isArray(expired) && expired.length) await storage.remove(expired);
    const { data, error } = await storage.createSignedUploadUrl(path, { upsert: false });
    if (error || !data) throw new Error("JumpServe could not prepare the PDF upload. Retry the same bundle.");
    return data.signedUrl;
  }

  const { data, error } = await storage.download(path);
  if (error || !data) throw new Error("JumpServe could not read the uploaded PDF. Retry the same bundle.");
  if (data.size !== paper.byte_count) throw new Error("The uploaded PDF size differs from the assessed paper.");
  const bytes = Buffer.from(await data.arrayBuffer());
  if (!/^[ \t\r\n\v\f]*%PDF-/.test(bytes.subarray(0, 1024).toString("latin1")) ||
      createHash("sha256").update(bytes).digest("hex") !== paper.sha256) {
    throw new Error("The uploaded file differs from the assessed PDF.");
  }
  const time = new Date().toISOString();
  const { data: saved, error: saveError } = await db.from("research_skill_submissions").update({ pdf_verified_at: time })
    .eq("owner_id", owner).eq("id", id).eq("bundle_sha256", hash).is("study_id", null)
    .is("pdf_verified_at", null).gt("expires_at", time).select("id").maybeSingle();
  if (saveError || (!saved && !await verifiedPdf(db, owner, id))) {
    throw new Error("JumpServe could not verify the PDF for this preview. Retry the same bundle.");
  }
  return undefined;
}

export async function createAuthorizationCode(owner: string, request: { clientId: string; redirectUri: string; challenge: string }, resource: string) {
  const db = await serviceDatabase();
  const { error: cleanup } = await db.from("jumpserve_mcp_codes").delete().eq("owner_id", owner).lt("expires_at", new Date().toISOString());
  if (cleanup) throw new Error("Could not prepare connector sign-in.");
  const code = opaqueCredential();
  const { error } = await db.from("jumpserve_mcp_codes").insert({
    code_hash: credentialHash(code), owner_id: owner, client_id: request.clientId,
    redirect_uri: request.redirectUri, resource, challenge: request.challenge,
  });
  if (error) throw new Error("Could not prepare connector sign-in.");
  return code;
}

export async function exchangeGrant(input: {
  grant: "authorization_code" | "refresh_token"; proof: string; client: string;
  resource: string; redirect: string | null; challenge: string | null;
}) {
  const db = await serviceDatabase();
  const access = opaqueCredential();
  const refresh = opaqueCredential();
  const { data, error } = await db.rpc("jumpserve_mcp_exchange", {
    p_grant: input.grant, p_proof_hash: credentialHash(input.proof), p_client: input.client,
    p_resource: input.resource, p_access: credentialHash(access), p_refresh: credentialHash(refresh),
    p_redirect: input.redirect, p_challenge: input.challenge,
  });
  if (error) throw new Error("Could not verify connector sign-in.");
  return data === true ? { access_token: access, refresh_token: refresh } : null;
}

export async function connectorActor(token: string, resource: string) {
  const db = await serviceDatabase();
  const { data, error } = await db.rpc("jumpserve_mcp_actor", { p_access: credentialHash(token), p_resource: resource });
  if (error) throw new Error("Could not verify the connector session.");
  return typeof data === "string" ? data : null;
}

export async function revokeConnector(owner: string, resource: string) {
  const db = await serviceDatabase();
  const { error } = await db.rpc("jumpserve_mcp_revoke", { p_owner: owner, p_resource: resource });
  if (error) throw new Error("Could not disconnect all JumpServe clients.");
}

export async function previewAssessment(owner: string, bundle: AssessmentBundle, hash: string) {
  const db = await serviceDatabase();
  const { data, error } = await db.rpc("research_skill_preview", { p_owner: owner, p_hash: hash, p_bundle: bundle });
  if (error?.code === "54000") throw new Error("Eight previews are pending. Submit an approved preview or wait for it to expire.");
  if (error?.code === "P0002") throw new Error("This assessment was deleted.");
  if (error || typeof data?.preview_id !== "string") throw new Error("JumpServe could not save the preview. Retry the same bundle.");
  const previewId = data.preview_id as string, studyId = (data.study_id ?? null) as string | null;
  const pdfUploadUrl = bundle.paper.pdf_copy && !studyId ? await preparePdfUpload(db, owner, previewId, hash, bundle.paper) : undefined;
  return { previewId, studyId, pdfUploadUrl };
}

export async function readAssessmentPreview(owner: string, id: string) {
  const db = await serviceDatabase();
  const { data, error } = await db.from("research_skill_submissions")
    .select("bundle,bundle_sha256,approved_at,study_id")
    .eq("owner_id", owner).eq("id", id)
    .or(`expires_at.gt.${new Date().toISOString()},study_id.not.is.null`).maybeSingle();
  if (error) throw new Error("JumpServe could not load the preview.");
  if (!data) return null;
  const { bundle } = prepareAssessmentBundle(data.bundle);
  const pdfReady = !!bundle.paper.pdf_copy && await verifiedPdf(db, owner, id);
  return { bundle, hash: data.bundle_sha256 as string, approved: !!data.approved_at, studyId: data.study_id as string | null, pdfReady };
}

export async function approveAssessment(owner: string, id: string, hash: string) {
  const db = await serviceDatabase();
  const timestamp = new Date().toISOString();
  const { data, error } = await db.from("research_skill_submissions").update({ approved_at: timestamp })
    .eq("owner_id", owner).eq("id", id).eq("bundle_sha256", hash).is("study_id", null)
    .gt("expires_at", timestamp).select("id").maybeSingle();
  if (error) throw new Error("JumpServe could not approve the preview.");
  return !!data;
}

export async function submitAssessment(owner: string, id: string) {
  const db = await serviceDatabase();
  const { data, error } = await db.rpc("research_skill_submit", { p_owner: owner, p_preview: id });
  if (error?.code === "55000") throw new Error("The preview needs owner approval or has expired. Open the review link or request a new preview.");
  if (error?.code === "P0002") throw new Error("This preview or assessment is unavailable.");
  if (error || typeof data !== "string") throw new Error("JumpServe could not confirm submission. Retry this preview ID.");
  return data;
}

export async function readSharedSkillAssessment(id: string) {
  const { data, error } = await createStaticClient().rpc("research_skill_shared", { p_study: id })
    .abortSignal(AbortSignal.timeout(5000));
  // Existing installations serve legacy assessments until the additive migration lands.
  if (error?.code === "PGRST202") return null;
  if (error) throw new Error("JumpServe could not load the shared assessment.");
  return data === null ? null : prepareAssessmentBundle(data).bundle;
}

export async function assessmentPdfDownload(id: string, owner?: string) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  try {
    const available = owner ? (await readAssessmentPreview(owner, id))?.pdfReady
      : (await readSharedSkillAssessment(id))?.paper.pdf_copy;
    if (!available) return new Response(null, { status: 404, headers });
    const db = await serviceDatabase();
    const { data, error } = await db.storage.from(paperBucket).createSignedUrl(paperObject(id), 60, { download: "source-paper.pdf" });
    if (error || !data) throw new Error("The assessment PDF is unavailable.");
    return new Response(null, { status: 303, headers: { ...headers, Location: data.signedUrl } });
  } catch {
    return new Response("The assessment PDF is temporarily unavailable.", { status: 503, headers });
  }
}
