import { createHash } from "node:crypto";
import Ajv from "ajv";
import { canonicalJson, checkAssessmentText, SKILL_INSTRUCTION_SCHEMA, type SkillInstructionProvenance } from "@/lib/jumpserve-assessment-bundle";
import { isResearchId } from "@/lib/research-experiment-queue";

const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  type: "object", additionalProperties: false, properties, required,
});

export const COACH_REPORT_SCHEMA = object({
  version: { const: "jumpserve-coach-report-v1" },
  sources: { type: "array", minItems: 1, maxItems: 20, items: object({
    verification_id: { type: "string", format: "uuid" },
    assessment_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
  }) },
  summary: text(1500),
  recommendations: { type: "array", maxItems: 20, items: object({
    title: text(160), finding: text(1600), proposed_change: text(2000), regression_check: text(1600),
  }) },
  limitations: { type: "array", maxItems: 20, items: text(1000) },
  skill_instructions: SKILL_INSTRUCTION_SCHEMA,
}, ["version", "sources", "summary", "recommendations", "limitations"]);

type CoachReport = {
  version: "jumpserve-coach-report-v1";
  skill_instructions?: SkillInstructionProvenance;
  sources: Array<{ verification_id: string; assessment_sha256: string }>;
  summary: string;
  recommendations: Array<{ title: string; finding: string; proposed_change: string; regression_check: string }>;
  limitations: string[];
};

const validateReport = new Ajv({ strict: true, formats: { uuid: isResearchId } }).compile<CoachReport>(COACH_REPORT_SCHEMA);

export function prepareCoachReport(input: unknown) {
  if (!validateReport(input)) throw new Error(`Coach report does not match jumpserve-coach-report-v1 at ${validateReport.errors?.[0]?.instancePath || "/"}.`);
  checkAssessmentText(input);
  const sources = input.sources.toSorted((a, b) => a.verification_id.localeCompare(b.verification_id));
  if (new Set(sources.map(source => source.verification_id)).size !== sources.length) {
    throw new Error("List each verification ID only once in a Coach report.");
  }
  const report = { ...input, sources };
  const json = canonicalJson(report);
  if (Buffer.byteLength(json) > 75_000) throw new Error("The Coach report exceeds 75 KB.");
  return { report, hash: createHash("sha256").update(json).digest("hex") };
}
