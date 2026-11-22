import Ajv from "ajv";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import assessmentSchema from "@/skills/jumpserve-paper-assessment/references/assessment.schema.json" with { type: "json" };
import type { PaperBreakdownSection } from "@/lib/research-paper-breakdown";

type Outcome = "untested" | "inconclusive" | "reproduced" | "discrepant";
export type AssessmentBundle = {
  version: "jumpserve-assessment-v1";
  paper: { title: string; authors: string[]; domain: string; url?: string; sha256: string; byte_count: number };
  summary: string;
  wizard?: {
    breakdown: Array<{ section: PaperBreakdownSection; description: string; pages: number[] }>;
    experiments: Array<{
      title: string;
      claim_ids: string[];
      prerequisites: string[];
      setup?: string;
      cleanup?: string;
      command_notes?: string;
      steps: Array<{ title: string; instructions: string; commands?: string }>;
    }>;
  };
  claims: Array<{ id: string; page: number; claim: string; criterion: string; outcome: Outcome; finding: string }>;
  methods: Array<{ title: string; procedure: string; commands?: string }>;
  runs: Array<{
    id: string; configuration: string; started_at: string; artifact_sha256: string;
    measurements: Array<{ claim_id: string; metric: string; units: string; paper_value: number | null; observed_value: number }>;
  }>;
  limitations: string[];
};

export const ASSESSMENT_SCHEMA = assessmentSchema;
export const MAX_BUNDLE_BYTES = 500_000;
const validateSchema = new Ajv({ strict: true }).compile<AssessmentBundle>(assessmentSchema);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// The allowlist is the publication boundary. This is an additional check for
// common accidental disclosures in otherwise valid free-text fields.
const privateText = /\b(?:sk-[A-Za-z0-9_-]{12,}|sb_secret_[A-Za-z0-9_-]{8,}|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{12,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b|BEGIN (?:[A-Z]+ )*PRIVATE KEY|\bBearer\s+[\w.+/~=-]+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\/(?:Users|home|private|var|tmp|mnt|root|workspace)\/|[A-Z]:\\(?:Users|Documents)\\|\b(?:password|client[_-]?secret|access[_-]?token|api[_-]?key)\s*[:=]\s*\S+|[?&](?:token|signature|x-amz-signature)=/i;

function checkText(value: unknown): void {
  if (typeof value === "string") {
    if (!value.trim() || privateText.test(value) || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)) {
      throw new Error("Remove blank fields, credentials, contact details and private paths from the shared bundle.");
    }
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) checkText(item);
  }
}

export function prepareAssessmentBundle(input: unknown): { bundle: AssessmentBundle; hash: string } {
  if (!validateSchema(input)) {
    const problem = validateSchema.errors?.[0];
    throw new Error(`Bundle does not match jumpserve-assessment-v1 at ${problem?.instancePath || "/"} (${problem?.keyword ?? "schema"}).`);
  }
  checkText(input);
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
  if (input.wizard?.experiments.some(experiment => experiment.claim_ids.some(id => !claims.has(id)))) {
    throw new Error("Every wizard experiment must refer to claims in this bundle.");
  }
  const measured = new Set<string>();
  const compared = new Set<string>();
  for (const run of input.runs) {
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
