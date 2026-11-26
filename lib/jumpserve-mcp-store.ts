import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createStaticClient } from "@/lib/supabase/server";
import { paperIntakeCredentials } from "@/lib/paper-intake-credentials";
import { prepareAssessmentBundle, type AssessmentBundle } from "@/lib/jumpserve-assessment-bundle";
import { clientInfo, credentialHash, isRegisteredClientId, MCP_DOWNLOAD_SCOPE, MCP_SCOPE, opaqueCredential } from "@/lib/jumpserve-mcp-oauth";
import { localAssessmentSourceFilename, PAPER_UPLOAD_BUCKET, type LocalAssessmentSource } from "@/lib/local-assessment-source";
import { PAPER_UPLOAD_MAX_BYTES } from "@/lib/research-paper-upload";
import { encodeAssessmentCursor, type AssessmentCursor } from "@/lib/research-assessment-cursor";
import { isResearchId } from "@/lib/research-experiment-queue";
import type { PublishedSkillInstructions, SkillRole } from "@/lib/jumpserve-skill-instructions";
import { validPaperAuthors, type PaperCatalog } from "@/lib/research-paper-catalog";
import type { prepareGeneratorResult, prepareVerifierResult, VerifierScorecard } from "@/lib/jumpserve-verification";
import type { prepareCoachReport } from "@/lib/jumpserve-coach";

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

const paperObject = (id: string) => `jumpserve-mcp/${id}.pdf`;
const sourceObject = (owner: string, sha256: string) => `local-assessment-sources/${owner}/${sha256}.pdf`;
type PaperStorage = ReturnType<Awaited<ReturnType<typeof serviceDatabase>>["storage"]["from"]>;
type ServiceDatabase = Awaited<ReturnType<typeof serviceDatabase>>;

export async function getSkillInstructions(role: SkillRole, versionId?: string) {
  const db = await serviceDatabase();
  const { data, error } = await db.rpc("research_skill_get_instructions", {
    p_role: role, p_version_id: versionId ?? null,
  }).maybeSingle().overrideTypes<PublishedSkillInstructions, { merge: false }>();
  if (error) throw new Error("JumpServe could not load published skill instructions.");
  if (!data) return null;
  const versionNumber = data.version_number;
  if (data.role !== role || !isResearchId(data.version_id) || (versionId && data.version_id !== versionId) ||
      (versionNumber !== undefined && (!Number.isSafeInteger(versionNumber) || versionNumber < 1)) ||
      typeof data.instructions !== "string" || !data.instructions.trim() || Buffer.byteLength(data.instructions) > 24_000 ||
      createHash("sha256").update(data.instructions).digest("hex") !== data.sha256) {
    throw new Error("JumpServe could not verify the published skill instructions.");
  }
  return { role, version_id: data.version_id, sha256: data.sha256, instructions: data.instructions,
    ...(versionNumber !== undefined && { version_number: versionNumber }) };
}

function matchesPdf(bytes: Buffer, sha256: string) {
  return /^[ \t\r\n\v\f]*%PDF-/.test(bytes.subarray(0, 1024).toString("latin1")) &&
    createHash("sha256").update(bytes).digest("hex") === sha256;
}

async function verifiedPdfObject(storage: PaperStorage, path: string, sha256: string, size: number) {
  if (!(await storage.exists(path)).data) return null;
  const { data, error } = await storage.download(path);
  if (error || !data) throw new Error("JumpServe could not read the private PDF.");
  if (data.size < 1 || data.size > PAPER_UPLOAD_MAX_BYTES || data.size !== size) return null;
  return matchesPdf(Buffer.from(await data.arrayBuffer()), sha256) ? { sha256, byte_count: data.size } : null;
}

async function sourceIdentity(db: ServiceDatabase, owner: string, assessmentId: string): Promise<LocalAssessmentSource | null> {
  const { data, error } = await db.from("research_skill_sources").select("sha256,byte_count")
    .eq("owner_id", owner).eq("id", assessmentId).maybeSingle();
  if (error) throw new Error("JumpServe could not look up the assessment PDF.");
  return data;
}

export async function readLocalAssessmentSource(owner: string, assessmentId: string) {
  const db = await serviceDatabase();
  const source = await sourceIdentity(db, owner, assessmentId);
  return source && await verifiedPdfObject(db.storage.from(PAPER_UPLOAD_BUCKET), sourceObject(owner, source.sha256), source.sha256, source.byte_count);
}

export async function reserveLocalAssessmentSource(owner: string, assessmentId: string, { sha256, byte_count }: LocalAssessmentSource) {
  const db = await serviceDatabase();
  const { error: saveError } = await db.from("research_skill_sources").upsert(
    { id: assessmentId, owner_id: owner, sha256, byte_count }, { onConflict: "id", ignoreDuplicates: true },
  );
  if (saveError) throw new Error("JumpServe could not reserve the assessment ID.");
  const reserved = await sourceIdentity(db, owner, assessmentId);
  if (reserved?.sha256 !== sha256 || reserved.byte_count !== byte_count) return null;

  const storage = db.storage.from(PAPER_UPLOAD_BUCKET);
  const path = sourceObject(owner, sha256);
  if ((await storage.exists(path)).data) return { status: "stored" } as const;
  const { data, error } = await storage.createSignedUploadUrl(path, { upsert: false });
  if (data && !error) return { status: "pending", path, token: data.token, uploadUrl: data.signedUrl } as const;
  // The same PDF may have finished uploading in another tab after the check.
  if ((await storage.exists(path)).data) return { status: "stored" } as const;
  throw new Error("JumpServe could not prepare the private PDF upload.");
}

export async function localAssessmentSourceTicket(owner: string, assessmentId: string, expiresIn = 60) {
  const db = await serviceDatabase();
  const source = await sourceIdentity(db, owner, assessmentId);
  const storage = db.storage.from(PAPER_UPLOAD_BUCKET);
  if (!source || !await verifiedPdfObject(storage, sourceObject(owner, source.sha256), source.sha256, source.byte_count)) return null;
  const filename = localAssessmentSourceFilename(assessmentId);
  const { data, error } = await storage.createSignedUrl(sourceObject(owner, source.sha256), expiresIn, { download: filename });
  if (error || !data) throw new Error("JumpServe could not prepare the private PDF download.");
  return { assessment_id: assessmentId, filename, ...source, download_url: data.signedUrl, expires_in: expiresIn };
}

export async function localAssessmentSourceDownload(owner: string, assessmentId: string) {
  return (await localAssessmentSourceTicket(owner, assessmentId))?.download_url ?? null;
}

async function verifiedPdf(db: Awaited<ReturnType<typeof serviceDatabase>>, owner: string, id: string) {
  const { data, error } = await db.from("research_skill_submissions")
    .select("pdf_verified_at").eq("owner_id", owner).eq("id", id).maybeSingle();
  if (error) throw new Error("JumpServe could not check the PDF attachment.");
  return typeof data?.pdf_verified_at === "string";
}

async function attachStepOnePdf(db: ServiceDatabase, owner: string, id: string, source: LocalAssessmentSource) {
  const storage = db.storage.from(PAPER_UPLOAD_BUCKET);
  const path = paperObject(id);
  const attachmentExists = (await storage.exists(path)).data;
  if (attachmentExists && await verifiedPdf(db, owner, id)) return;
  const original = sourceObject(owner, source.sha256);
  if (!await verifiedPdfObject(storage, original, source.sha256, source.byte_count)) {
    throw new Error("Finish uploading the matching PDF in JumpServe Step 1, then retry the saved bundle.");
  }
  // The public download may expose this path. Keep the owner's account ID
  // and the original Step 1 storage path private.
  if (!attachmentExists) {
    const { error } = await storage.copy(original, path);
    if (error && !(await storage.exists(path)).data) throw new Error("JumpServe could not attach the private PDF. Retry the same bundle.");
  }
  if (!await verifiedPdfObject(storage, path, source.sha256, source.byte_count)) {
    throw new Error("The saved attachment differs from the Step 1 PDF.");
  }
}

export async function createAuthorizationCode(owner: string, request: { clientId: string; redirectUri: string; challenge: string; readSources: boolean }, resource: string) {
  const db = await serviceDatabase();
  const { error: cleanup } = await db.from("jumpserve_mcp_codes").delete().eq("owner_id", owner).lt("expires_at", new Date().toISOString());
  if (cleanup) throw new Error("Could not prepare connector sign-in.");
  const code = opaqueCredential();
  const { error } = await db.from("jumpserve_mcp_codes").insert({
    code_hash: credentialHash(code), owner_id: owner, client_id: request.clientId,
    redirect_uri: request.redirectUri, resource, challenge: request.challenge, read_sources: request.readSources,
  });
  if (error) throw new Error("Could not prepare connector sign-in.");
  return code;
}

export async function exchangeGrant(input: {
  grant: "authorization_code" | "refresh_token"; proof: string; client: string;
  resource: string; redirect: string | null; challenge: string | null; readSources: boolean | null;
}) {
  const db = await serviceDatabase();
  const access = opaqueCredential();
  const refresh = opaqueCredential();
  const { data, error } = await db.rpc("jumpserve_mcp_exchange_scoped", {
    p_grant: input.grant, p_proof_hash: credentialHash(input.proof), p_client: input.client,
    p_resource: input.resource, p_access: credentialHash(access), p_refresh: credentialHash(refresh),
    p_redirect: input.redirect, p_challenge: input.challenge, p_read_sources: input.readSources,
  });
  if (error) throw new Error("Could not verify connector sign-in.");
  return data === "share" || data === "source"
    ? { access_token: access, refresh_token: refresh, scope: data === "source" ? MCP_DOWNLOAD_SCOPE : MCP_SCOPE }
    : null;
}

export async function connectorActor(token: string, resource: string) {
  const db = await serviceDatabase();
  const { data, error } = await db.rpc("jumpserve_mcp_actor", { p_access: credentialHash(token), p_resource: resource });
  if (error) throw new Error("Could not verify the connector session.");
  return typeof data === "string" ? data : null;
}

export async function connectorMayDownloadSource(token: string, resource: string) {
  const db = await serviceDatabase();
  const { data, error } = await db.rpc("jumpserve_mcp_can_read_sources", { p_access: credentialHash(token), p_resource: resource });
  if (error) throw new Error("Could not verify the connector’s PDF download permission.");
  return data === true;
}

export async function revokeConnector(owner: string, resource: string) {
  const db = await serviceDatabase();
  const { error } = await db.rpc("jumpserve_mcp_revoke", { p_owner: owner, p_resource: resource });
  if (error) throw new Error("Could not disconnect all JumpServe clients.");
}

export async function previewAssessment(owner: string, bundle: AssessmentBundle, hash: string, assessmentId: string) {
  const db = await serviceDatabase();
  const mismatch = "The assessment ID does not match a private Step 1 upload in this account or the assessed PDF is different.";
  const source = await sourceIdentity(db, owner, assessmentId);
  if (!source || !bundle.paper.pdf_copy || source.sha256 !== bundle.paper.sha256 || source.byte_count !== bundle.paper.byte_count) {
    throw new Error(mismatch);
  }
  await attachStepOnePdf(db, owner, assessmentId, source);
  const { data, error } = await db.rpc("research_skill_save_from_source", {
    p_owner: owner, p_hash: hash, p_bundle: bundle, p_assessment_id: assessmentId,
  });
  if (error?.code === "P0002") throw new Error("This assessment was deleted.");
  if (error?.code === "22023") throw new Error(mismatch);
  if (error?.code === "23505") throw new Error("This ID already belongs to a different saved assessment. Open the existing assessment or start another one.");
  if (error || typeof data?.preview_id !== "string") throw new Error("JumpServe could not save the private assessment. Retry the same bundle.");
  return { previewId: data.preview_id as string, studyId: (data.study_id ?? null) as string | null };
}

export async function readAssessmentPreview(owner: string, id: string) {
  const db = await serviceDatabase();
  const { data, error } = await db.from("research_skill_submissions")
    .select("bundle,study_id")
    .eq("owner_id", owner).eq("id", id)
    .or("completed_at.not.is.null,study_id.not.is.null").maybeSingle();
  if (error) throw new Error("JumpServe could not load the private assessment.");
  if (!data) return null;
  const { bundle } = prepareAssessmentBundle(data.bundle);
  const pdfReady = !!bundle.paper.pdf_copy && await verifiedPdf(db, owner, id);
  return { bundle, studyId: data.study_id as string | null, pdfReady };
}

export async function isSharedSkillAssessmentOwner(owner: string, assessmentId: string) {
  const db = await serviceDatabase();
  const { data, error } = await db.from("research_skill_submissions").select("id")
    .eq("owner_id", owner).eq("study_id", assessmentId).maybeSingle();
  if (error) throw new Error("JumpServe could not check the assessment owner.");
  return data !== null;
}

export type AssessmentVerifierResult = Pick<VerifierScorecard, "status" | "mode" | "scenario" | "split" |
  "score" | "evidence_integrity" | "claims" | "rubric" | "blockers" | "critical_failures"> & AssessmentCursor & {
  verifier_version: string;
  generator: { bundle_sha256: string; result_kind: "assessment" | "replay_analysis" };
};

export async function readAssessmentVerifierResults(owner: string, assessmentId: string, before?: AssessmentCursor) {
  const db = await serviceDatabase();
  let query = db.from("research_skill_verifier_results").select(`
    id,created_at,verifier_version,status,mode,scenario,split,
    score:scorecard->score,evidence_integrity:scorecard->evidence_integrity,claims:scorecard->claims,
    rubric:scorecard->rubric,blockers:scorecard->blockers,critical_failures:scorecard->critical_failures,
    generator:research_skill_generator_results!inner(bundle_sha256,result_kind,
      assessment:research_skill_submissions!inner(id))
  `).eq("generator.assessment.id", assessmentId).eq("generator.assessment.owner_id", owner);
  if (before) {
    query = query.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`);
  }
  const pageSize = 5;
  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(pageSize + 1).overrideTypes<AssessmentVerifierResult[], { merge: false }>();
  if (error || !data) throw new Error("JumpServe could not load private Verifier results.");
  const results = data.slice(0, pageSize);
  return { results, nextCursor: data.length > pageSize ? encodeAssessmentCursor(results[pageSize - 1]) : null };
}

export async function saveGeneratorResult(owner: string, assessmentId: string, data: ReturnType<typeof prepareGeneratorResult>) {
  const db = await serviceDatabase();
  const { data: id, error } = await db.rpc("research_skill_save_generator_result", {
    p_owner: owner, p_assessment_id: assessmentId, p_hash: data.hash, p_bundle: data.bundle,
  });
  if (error?.code === "P0002") throw new Error("Complete the matching assessment in JumpServe before saving additional results.");
  if (error?.code === "22023") throw new Error("The Generator result does not match the saved assessment's paper.");
  if (error || typeof id !== "string") throw new Error("JumpServe could not save the private Generator result. Retry with the identical result.");
  return id;
}

export async function saveVerifierResult(owner: string, assessmentId: string, version: string, data: ReturnType<typeof prepareVerifierResult>) {
  const db = await serviceDatabase();
  const { data: id, error } = await db.rpc("research_skill_save_verifier_result", {
    p_owner: owner, p_assessment_id: assessmentId, p_generator_hash: data.generatorHash, p_bundle: data.bundle,
    p_verifier_version: version, p_hash: data.hash, p_scorecard: data.scorecard,
  });
  if (error?.code === "P0002") throw new Error("The exact reviewed Generator result is unavailable. Save that result in the same account before retrying.");
  if (error?.code === "22023") throw new Error("The scorecard does not match the saved Generator result.");
  if (error || typeof id !== "string") throw new Error("JumpServe could not save the private Verifier scorecard. Retry with the identical inputs.");
  return id;
}

export async function saveCoachReport(owner: string, { report, hash }: ReturnType<typeof prepareCoachReport>) {
  const db = await serviceDatabase();
  const { data: id, error } = await db.rpc("research_skill_save_coach_report", {
    p_owner: owner, p_hash: hash, p_report: report,
  });
  if (error?.code === "P0002") throw new Error("A matching development Verifier scorecard is unavailable in this account.");
  if (error?.code === "22023") throw new Error("JumpServe rejected the private Coach report.");
  if (error?.code === "PGRST202") throw new Error("JumpServe Coach storage is unavailable on this installation.");
  if (error || typeof id !== "string") throw new Error("JumpServe could not confirm the private Coach save. Retry with the identical report.");
  return id;
}

export async function readPrivateAssessmentCatalog(owner: string, before?: AssessmentCursor): Promise<PaperCatalog> {
  const db = await serviceDatabase();
  let query = db.from("research_skill_submissions")
    .select("id,completed_at,title:bundle->paper->>title,authors:bundle->paper->authors")
    .eq("owner_id", owner).is("study_id", null).not("completed_at", "is", null);
  if (before) {
    query = query.or(`completed_at.lt.${before.created_at},and(completed_at.eq.${before.created_at},id.lt.${before.id})`);
  }
  const { data, error } = await query.order("completed_at", { ascending: false }).order("id", { ascending: false }).limit(11);
  if (error || !data) throw new Error("JumpServe could not load private assessments.");
  const papers = data.slice(0, 10).map(row => ({
    id: row.id,
    title: row.title,
    authors: validPaperAuthors(row.authors) ? row.authors : null,
    initiated_by: "You",
    created_at: row.completed_at,
    workflow_status: null,
  }));
  return {
    version: "research-paper-catalog-v1", access: "owner-read-only", papers,
    coverage: { papers: papers.length }, next_cursor: data.length > 10 ? encodeAssessmentCursor(papers[9]) : null,
  };
}

export async function submitAssessment(owner: string, id: string) {
  const db = await serviceDatabase();
  const { data, error } = await db.rpc("research_skill_submit", { p_owner: owner, p_preview: id });
  if (error?.code === "55000") throw new Error("The assessment must be complete and approved by its owner before public sharing.");
  if (error?.code === "P0002") throw new Error("This assessment is unavailable.");
  if (error || typeof data !== "string") throw new Error("JumpServe could not confirm public sharing. Retry the same assessment ID.");
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
    const preview = owner ? await readAssessmentPreview(owner, id) : null;
    const available = owner ? preview && !preview.studyId && preview.pdfReady
      : (await readSharedSkillAssessment(id))?.paper.pdf_copy;
    if (!available) return new Response(null, { status: 404, headers });
    const db = await serviceDatabase();
    const { data, error } = await db.storage.from(PAPER_UPLOAD_BUCKET).createSignedUrl(paperObject(id), 60, { download: "source-paper.pdf" });
    if (error || !data) throw new Error("The assessment PDF is unavailable.");
    return new Response(null, { status: 303, headers: { ...headers, Location: data.signedUrl } });
  } catch {
    return new Response("The assessment PDF is temporarily unavailable.", { status: 503, headers });
  }
}
