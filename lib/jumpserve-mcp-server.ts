import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ASSESSMENT_SCHEMA, prepareAssessmentBundle } from "@/lib/jumpserve-assessment-bundle";
import { isResearchId } from "@/lib/research-experiment-queue";
import { researchAssessmentPath } from "@/lib/research-pathways";
import { RESEARCH_WORKFLOW_MODULE_PATH } from "@/lib/test-modules";

export const SHARE_REVIEW_PATH = `${RESEARCH_WORKFLOW_MODULE_PATH}/share`;
const completionReply = "On success, send only the exact completion message below as plain text. End the reply immediately after the URL.";
const completionMessage = `Your research paper assessment is finished!

View the assessment online using the JumpServe app at the following URL:

{assessmentUrlHere}`;

const result = (value: Record<string, string>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value,
});

export async function serveJumpServeTools(request: Request, body: unknown, origin: string, tools: {
  preview: (data: ReturnType<typeof prepareAssessmentBundle>) => Promise<{ previewId: string; studyId: string | null }>;
  submit: (id: string) => Promise<string>;
}) {
  const server = new Server({ name: "JumpServe", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: "preview_assessment",
        description: `Stage a requested JumpServe assessment privately and return its results link for owner review. Populate bundle.wizard with the paper breakdown, ordered experiment steps, shareable local commands and any script files those commands need. Honor local-only requests. Exclude original PDFs, raw logs, private paths and credentials. Replace {assessmentUrlHere} with assessment_url for already_shared or review_url for review_required. ${completionReply}\n\n${completionMessage}`,
        inputSchema: { type: "object", additionalProperties: false, required: ["bundle"], properties: { bundle: ASSESSMENT_SCHEMA } },
        annotations: { title: "Preview assessment", idempotentHint: true },
      },
      {
        name: "submit_assessment",
        description: `Share the exact preview approved by the account owner on JumpServe. Retry the same preview ID after an uncertain result. Replace {assessmentUrlHere} with assessment_url. ${completionReply}\n\n${completionMessage}`,
        inputSchema: { type: "object", additionalProperties: false, required: ["preview_id"], properties: { preview_id: { type: "string", format: "uuid" } } },
        annotations: { title: "Submit approved assessment", idempotentHint: true },
      },
    ],
  }));
  const assessmentUrl = (id: string) => new URL(researchAssessmentPath(id), origin).href;
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const args = params.arguments;
    try {
      if (params.name === "preview_assessment" && args && Object.keys(args).length === 1 && "bundle" in args) {
        const preview = await tools.preview(prepareAssessmentBundle(args.bundle));
        return preview.studyId
          ? result({ assessment_url: assessmentUrl(preview.studyId), status: "already_shared" })
          : result({ preview_id: preview.previewId, review_url: new URL(`${SHARE_REVIEW_PATH}/${preview.previewId}`, origin).href, status: "review_required" });
      }
      if (params.name === "submit_assessment" && args && Object.keys(args).length === 1 && isResearchId(args.preview_id)) {
        return result({ assessment_url: assessmentUrl(await tools.submit(args.preview_id)), status: "shared" });
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
