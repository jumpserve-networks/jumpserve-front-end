import Ajv from "ajv";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import assessmentSchema from "@/skills/jumpserve-paper-assessment/references/assessment.schema.json" with { type: "json" };
import shareableText from "@/skills/jumpserve-paper-assessment/references/shareable-text.json" with { type: "json" };
import { validPaperDependencies } from "@/lib/paper-detail-dependencies";
import { PAPER_BREAKDOWN_SECTIONS, type PaperBreakdownSection } from "@/lib/research-paper-breakdown";

type Outcome = "untested" | "inconclusive" | "reproduced" | "discrepant";
export type SkillInstructionProvenance =
  | { source: "supabase"; version_id: string; sha256: string }
  | { source: "bundled" | "candidate"; sha256: string };
type AssessmentBreakdownItem = {
  section: PaperBreakdownSection;
  id?: string;
  parent_id?: string;
  title?: string;
  description: string;
  pages: number[];
};
export type AssessmentBundle = {
  version: "jumpserve-assessment-v1";
  skill_instructions?: SkillInstructionProvenance;
  paper: { title: string; authors: string[]; domain: string; url?: string; sha256: string; byte_count: number; pdf_copy?: true };
  summary: string;
  wizard?: {
    breakdown: AssessmentBreakdownItem[];
    experiments: Array<{
      id?: string;
      title: string;
      claim_ids: string[];
      prerequisites: string[];
      setup?: string;
      cleanup?: string;
      command_notes?: string;
      scripts?: Array<{ path: string; content: string }>;
      steps: Array<{ title: string; instructions: string; commands?: string }>;
    }>;
  };
  claims: Array<{ id: string; page: number; claim: string; criterion: string; outcome: Outcome; finding: string }>;
  methods: Array<{ title: string; procedure: string; commands?: string }>;
  runs: Array<{
    id: string; experiment_id?: string; configuration: string; started_at: string; artifact_sha256: string;
    measurements: Array<{ claim_id: string; metric: string; units: string; paper_value: number | null; observed_value: number }>;
  }>;
  limitations: string[];
};

export function assessmentBreakdownSteps(breakdown: AssessmentBreakdownItem[], section: PaperBreakdownSection) {
  return breakdown.filter(item => item.section === section).map((item, index) => ({
    ...item,
    id: item.id ?? `#${index}`,
    depends_on: item.parent_id ? [item.parent_id] : [],
  }));
}

export const ASSESSMENT_SCHEMA = assessmentSchema;
export const SKILL_INSTRUCTION_SCHEMA = assessmentSchema.properties.skill_instructions;
export const MAX_BUNDLE_BYTES = 500_000;
const validateSchema = new Ajv({ strict: true }).compile<AssessmentBundle>(assessmentSchema);

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// The allowlist is the publication boundary. This is an additional check for
// common accidental disclosures in otherwise valid free-text fields.
const privateText = new RegExp(shareableText.privatePattern, "i");
const invalidControl = new RegExp(shareableText.controlPattern);

export function checkAssessmentText(value: unknown, path = ""): void {
  if (typeof value === "string") {
    if (!value.trim() || privateText.test(value) || invalidControl.test(value)) {
      throw new Error(`${shareableText.message} at ${path || "/"}.`);
    }
  } else if (value !== null && typeof value === "object") {
    // Callers validate closed schemas before checking text, so keys are field names.
    for (const [key, item] of Object.entries(value)) {
      checkAssessmentText(item, `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
    }
  }
}

export function prepareAssessmentBundle(input: unknown): { bundle: AssessmentBundle; hash: string } {
  if (!validateSchema(input)) {
    const problem = validateSchema.errors?.[0];
    throw new Error(`Bundle does not match jumpserve-assessment-v1 at ${problem?.instancePath || "/"} (${problem?.keyword ?? "schema"}).`);
  }
  checkAssessmentText(input);
  if (input.paper.url) {
    const url = URL.parse(input.paper.url);
    const host = url?.hostname.replace(/^\[|\]$/g, "") ?? "";
    if (!url || url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        !host.includes(".") || isIP(host) || /\.(?:local|internal|localhost)$/.test(host)) {
      throw new Error("Use a public HTTPS paper link without credentials, query parameters or fragments.");
    }
  }
  const claims = new Map(input.claims.map(claim => [claim.id, claim]));
  if (claims.size !== input.claims.length || new Set(input.runs.map(run => run.id)).size !== input.runs.length) {
    throw new Error("Claim and run identifiers must be unique.");
  }
  if (input.wizard) {
    for (const { id, title } of PAPER_BREAKDOWN_SECTIONS) {
      if (!validPaperDependencies(assessmentBreakdownSteps(input.wizard.breakdown, id))) {
        throw new Error(`${title} step IDs must be unique and parent references must stay in the same section without cycles.`);
      }
    }
  }
  const experimentsById = new Map<string, Set<string>>();
  for (const experiment of input.wizard?.experiments ?? []) {
    if (experiment.id) {
      if (experimentsById.has(experiment.id)) throw new Error("Wizard experiment identifiers must be unique.");
      experimentsById.set(experiment.id, new Set(experiment.claim_ids));
    }
    if (experiment.claim_ids.some(id => !claims.has(id))) {
      throw new Error("Every wizard experiment must refer to claims in this bundle.");
    }
    const scripts = experiment.scripts ?? [];
    if (new Set(scripts.map(script => script.path)).size !== scripts.length) {
      throw new Error("Script paths must be unique within each experiment.");
    }
  }
  const measured = new Set<string>();
  const compared = new Set<string>();
  for (const run of input.runs) {
    if (run.experiment_id) {
      const experimentClaims = experimentsById.get(run.experiment_id);
      if (!experimentClaims) throw new Error("Every run experiment ID must identify an experiment in this bundle.");
      if (run.measurements.some(entry => !experimentClaims.has(entry.claim_id))) {
        throw new Error("Every linked run measurement must refer to a claim assigned to its experiment.");
      }
    }
    const date = new Date(run.started_at);
    const seconds = run.started_at.replace(/(?:\.\d{1,3})?Z$/, "");
    if (!Number.isFinite(date.getTime()) || !date.toISOString().startsWith(`${seconds}.`)) {
      throw new Error("Run timestamps must be valid UTC dates.");
    }
    for (const entry of run.measurements) {
      if (!claims.has(entry.claim_id)) throw new Error("Every measurement must identify a claim in this bundle.");
      measured.add(entry.claim_id);
      if (entry.paper_value !== null) compared.add(entry.claim_id);
    }
  }
  for (const claim of input.claims) {
    if (claim.outcome === "untested" && measured.has(claim.id)) throw new Error("An untested claim cannot carry measured results.");
    if ((claim.outcome === "reproduced" || claim.outcome === "discrepant") && !compared.has(claim.id)) {
      throw new Error("Reproduced and discrepant claims require a recorded comparison.");
    }
  }
  const json = canonicalJson(input);
  if (Buffer.byteLength(json) > MAX_BUNDLE_BYTES) throw new Error("The shared bundle exceeds 500 KB.");
  return { bundle: input, hash: createHash("sha256").update(json).digest("hex") };
}
