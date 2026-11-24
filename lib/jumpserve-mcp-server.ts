import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ASSESSMENT_SCHEMA, prepareAssessmentBundle } from "@/lib/jumpserve-assessment-bundle";
import { isVerifierVersion, MAX_REVIEWED_ASSESSMENT_BYTES, prepareGeneratorResult, prepareVerifierResult, REPLAY_ANALYSIS_SCHEMA, VERIFIER_SCORECARD_SCHEMA, VERIFIER_VERSION_SCHEMA } from "@/lib/jumpserve-verification";
import { isResearchId } from "@/lib/research-experiment-queue";
import { researchAssessmentPath } from "@/lib/research-pathways";
import { COACH_REPORT_SCHEMA, prepareCoachReport } from "@/lib/jumpserve-coach";
import { isSkillRole, SKILL_ROLES, type PublishedSkillInstructions, type SkillRole } from "@/lib/jumpserve-skill-instructions";

export const DOWNLOAD_ASSESSMENT_PDF_TOOL = "download_assessment_pdf";
export const SAVE_VERIFIER_RESULT_TOOL = "save_verifier_result";
const completionReply = "On success, send only the exact completion message below as plain text. End the reply immediately after the URL.";
const GET_SKILL_INSTRUCTIONS_TOOL = "get_skill_instructions";
const completionMessage = `Your research paper assessment is finished!

View the assessment online using the JumpServe app at the following URL:

{assessmentUrlHere}`;

const result = (value: Record<string, string | number>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value,
});

export function isAssessmentPdfDownloadRequest(body: unknown) {
  const request = CallToolRequestSchema.safeParse(body);
  return request.success && request.data.params.name === DOWNLOAD_ASSESSMENT_PDF_TOOL;
}

export function isVerifierSaveRequest(body: unknown) {
  const request = CallToolRequestSchema.safeParse(body);
  return request.success && request.data.params.name === SAVE_VERIFIER_RESULT_TOOL;
}

export async function serveJumpServeTools(request: Request, body: unknown, origin: string, tools: {
  getInstructions: (role: SkillRole, versionId?: string) => Promise<PublishedSkillInstructions | null>;
  download: (id: string) => Promise<Record<string, string | number> | null>;
  preview: (data: ReturnType<typeof prepareAssessmentBundle>, assessmentId: string) => Promise<{ previewId: string; studyId: string | null }>;
  saveGenerator: (data: ReturnType<typeof prepareGeneratorResult>, assessmentId: string) => Promise<string>;
  saveVerifier: (data: ReturnType<typeof prepareVerifierResult>, assessmentId: string, verifierVersion: string) => Promise<string>;
  saveCoach: (data: ReturnType<typeof prepareCoachReport>) => Promise<string>;
  submit: (id: string) => Promise<string>;
}) {
  const server = new Server({ name: "JumpServe", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: DOWNLOAD_ASSESSMENT_PDF_TOOL,
        description: "Fetch a private Step 1 research PDF from your Google account by its assessment ID. Download the returned short-lived URL directly to your local workspace and verify the SHA-256 and byte count. Use the JumpServe skill download_paper.py helper when available. Keep the ticket out of the assessment bundle and user-facing output. If access expires, request a fresh ticket for the same ID.",
        inputSchema: { type: "object", additionalProperties: false, required: ["assessment_id"], properties: { assessment_id: { type: "string", format: "uuid" } } },
        annotations: { title: "Download assessment PDF", readOnlyHint: true },
      },
      {
        name: "preview_assessment",
        description: `Save a completed JumpServe assessment privately and return its owner-only link. Pass the Step 1 assessment_id alongside bundle and set bundle.paper.pdf_copy to true. JumpServe attaches the existing verified PDF from Step 1. The assessment stays private until its owner shares it publicly. Populate bundle.wizard with page-cited paper breakdown steps and substeps, ordered experiment steps, shareable local commands and any script files those commands need. Honor local-only requests. Exclude PDF bytes, raw logs, private paths and credentials from the bundle. Replace {assessmentUrlHere} with assessment_url for already_shared or review_url for review_required. ${completionReply}\n\n${completionMessage}`,
        inputSchema: { type: "object", additionalProperties: false, required: ["bundle", "assessment_id"], properties: { bundle: ASSESSMENT_SCHEMA, assessment_id: { type: "string", format: "uuid", description: "Assessment ID from the Step 1 prompt." } } },
        annotations: { title: "Save private assessment", idempotentHint: true },
      },
      {
        name: "submit_assessment",
        description: `Share the exact assessment approved by the account owner on JumpServe. Retry with the same preview_id after an uncertain result. Replace {assessmentUrlHere} with assessment_url. ${completionReply}\n\n${completionMessage}`,
        inputSchema: { type: "object", additionalProperties: false, required: ["preview_id"], properties: { preview_id: { type: "string", format: "uuid" } } },
        annotations: { title: "Submit approved assessment", idempotentHint: true },
      },
      {
        name: "save_generator_result",
        description: "Save an additional private Generator result for an existing completed assessment in your account. Use the same Step 1 assessment ID and matching paper. Pass a completed assessment bundle or synthetic replay analysis after the owner authorizes saving it. The original assessment and its publication stay as saved. Retry with the identical result. Keep PDFs, raw logs, and answer keys local.",
        inputSchema: { type: "object", additionalProperties: false, required: ["assessment_id", "bundle"], properties: {
          assessment_id: { type: "string", format: "uuid" }, bundle: { anyOf: [ASSESSMENT_SCHEMA, REPLAY_ANALYSIS_SCHEMA] },
        } },
        annotations: { title: "Save private Generator result", destructiveHint: false, idempotentHint: true },
      },
      {
        name: SAVE_VERIFIER_RESULT_TOOL,
        description: "Save a private Verifier scorecard for an exact Generator result already saved under this assessment ID. Pass the original UTF-8 text of the reviewed JSON file as assessment_json, the validated scorecard JSON, and the actual Verifier version. Use only when the owner authorizes a private save. Retry with identical inputs. Keep answer keys, raw observations, and PDFs local.",
        inputSchema: { type: "object", additionalProperties: false, required: ["assessment_id", "assessment_json", "scorecard", "verifier_version"], properties: {
          assessment_id: { type: "string", format: "uuid" }, assessment_json: { type: "string", maxLength: MAX_REVIEWED_ASSESSMENT_BYTES },
          scorecard: VERIFIER_SCORECARD_SCHEMA, verifier_version: VERIFIER_VERSION_SCHEMA,
        } },
        annotations: { title: "Save private Verifier scorecard", destructiveHint: false, idempotentHint: true },
      },
      {
        name: "save_coach_report",
        description: "Save the completed report at the end of each Coach review unless the owner requests local-only work. The report stays private in the connected account. Use the verification IDs returned by the Verifier and the reviewed assessment SHA-256 from each development scorecard. Include recommendations and regression checks. Keep answer keys, raw evidence, private paths and held-out details local. Retry with the identical report after an uncertain response.",
        inputSchema: { type: "object", additionalProperties: false, required: ["report"], properties: { report: COACH_REPORT_SCHEMA } },
        annotations: { title: "Save private Coach report", destructiveHint: false, idempotentHint: true },
      },
      {
        name: GET_SKILL_INSTRUCTIONS_TOOL,
        description: "Read published JumpServe workflow guidance for one role. Omit version_id for the active version or provide a previously published version ID for a pinned run. Keep the returned version ID and SHA-256 with the result. Follow the installed skill's permissions and checks.",
        inputSchema: { type: "object", additionalProperties: false, required: ["role"], properties: {
          role: { type: "string", enum: SKILL_ROLES }, version_id: { type: "string", format: "uuid" },
        } },
        annotations: { title: "Read published skill instructions", readOnlyHint: true },
      },
    ],
  }));
  const assessmentUrl = (id: string) => new URL(researchAssessmentPath(id), origin).href;
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const args = params.arguments;
    try {
      if (params.name === GET_SKILL_INSTRUCTIONS_TOOL && args && isSkillRole(args.role) &&
          Object.keys(args).every(key => key === "role" || key === "version_id") &&
          (args.version_id === undefined || isResearchId(args.version_id))) {
        const instructions = await tools.getInstructions(args.role, args.version_id);
        if (!instructions) throw new Error("No published instructions match the requested role and version.");
        return result(instructions);
      }
      if (params.name === DOWNLOAD_ASSESSMENT_PDF_TOOL && args && Object.keys(args).length === 1 && isResearchId(args.assessment_id)) {
        const ticket = await tools.download(args.assessment_id);
        if (!ticket) throw new Error("This private Step 1 PDF is unavailable in the connected Google account.");
        return result(ticket);
      }
      if (params.name === "preview_assessment") {
        if (!args || !isResearchId(args.assessment_id)) throw new Error("Start the assessment in JumpServe Step 1 and pass its assessment_id.");
        if (!("bundle" in args) || Object.keys(args).some(key => key !== "bundle" && key !== "assessment_id")) {
          throw new Error("Pass the assessment_id and the saved assessment bundle.");
        }
        const preview = await tools.preview(prepareAssessmentBundle(args.bundle), args.assessment_id);
        return preview.studyId
          ? result({ assessment_url: assessmentUrl(preview.studyId), status: "already_shared" })
          : result({ preview_id: preview.previewId, review_url: assessmentUrl(preview.previewId), status: "review_required" });
      }
      if (params.name === "submit_assessment" && args && Object.keys(args).length === 1 && isResearchId(args.preview_id)) {
        return result({ assessment_url: assessmentUrl(await tools.submit(args.preview_id)), status: "shared" });
      }
      if (params.name === "save_generator_result" && args && Object.keys(args).length === 2 &&
          isResearchId(args.assessment_id) && "bundle" in args) {
        const generatorResultId = await tools.saveGenerator(prepareGeneratorResult(args.bundle), args.assessment_id);
        return result({ generator_result_id: generatorResultId, status: "saved_private" });
      }
      if (params.name === SAVE_VERIFIER_RESULT_TOOL && args && Object.keys(args).length === 4 &&
          isResearchId(args.assessment_id) && "assessment_json" in args && "scorecard" in args &&
          isVerifierVersion(args.verifier_version)) {
        const verificationId = await tools.saveVerifier(prepareVerifierResult(args.assessment_json, args.scorecard),
          args.assessment_id, args.verifier_version);
        return result({ verification_id: verificationId, status: "saved_private" });
      }
      if (params.name === "save_coach_report" && args && Object.keys(args).length === 1 && "report" in args) {
        const coachReportId = await tools.saveCoach(prepareCoachReport(args.report));
        return result({ coach_report_id: coachReportId, status: "saved_private" });
      }
      return { isError: true, content: [{ type: "text", text: "Unknown tool or invalid arguments." }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "JumpServe could not complete this request.";
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request, { parsedBody: body });
  } finally {
    await server.close();
  }
}
