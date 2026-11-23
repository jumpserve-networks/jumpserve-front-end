import { createHash } from "node:crypto";
import Ajv from "ajv";
import { canonicalJson, checkAssessmentText, prepareAssessmentBundle, type AssessmentBundle } from "@/lib/jumpserve-assessment-bundle";

const hash = { type: "string", pattern: "^[a-f0-9]{64}$" } as const;
const identifier = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$" } as const;
const outcome = { enum: ["untested", "inconclusive", "reproduced", "discrepant"] } as const;
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const strings = (maxItems: number, maxLength: number) => ({ type: "array", maxItems, items: text(maxLength) });
const points = { type: "number", minimum: 0, maximum: 100_000 } as const;
const count = { type: "integer", minimum: 0, maximum: 100_000 } as const;
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  type: "object" as const, properties, required, additionalProperties: false,
});

const replayClaimSchema = object({
  id: identifier, claim: text(2000), criterion: text(2000), outcome, finding: text(4000), calculation: text(4000),
}, ["id", "claim", "criterion", "outcome", "finding"]);

export const REPLAY_ANALYSIS_SCHEMA = object({
  version: { const: "jumpserve-replay-analysis-v1" }, paper: object({ sha256: hash }), scenario: identifier,
  claims: { type: "array", minItems: 1, maxItems: 50, items: replayClaimSchema },
});

const integritySchema = object({
  status: { enum: ["verified", "legacy_archive_matched", "fixture_only", "failed"] },
  verified_runs: count, archive_sha256: hash, archive_files: count, detail: text(1000), archive_detail: text(1000),
}, ["status"]);

export const VERIFIER_SCORECARD_SCHEMA = object({
  version: { const: "jumpserve-verifier-scorecard-v1" }, paper_id: identifier,
  paper_sha256: hash, assessment_sha256: hash, answer_key_sha256: hash,
  split: { enum: ["development", "held_out"] }, mode: { enum: ["fresh", "replay"] }, scenario: nullable(identifier),
  evidence_integrity: integritySchema, status: { enum: ["scored", "blocked", "failed"] },
  claims: { type: "array", maxItems: 50, items: object({
    key_claim_id: identifier, assessment_claim_id: nullable(identifier), reported_outcome: nullable(outcome),
    supported_outcome: nullable(outcome), assessment: { enum: ["correct", "incorrect", "unscored"] },
    evidence: strings(24, 400), finding: text(4000),
  }) },
  rubric: { type: "array", maxItems: 50, items: object({
    criterion: text(160), earned: nullable(points), maximum: points, reason: text(2000),
  }) },
  score: nullable(object({ earned: points, applicable_maximum: points, rubric_maximum: points })),
  critical_failures: strings(30, 1000), blockers: strings(30, 1000),
});

type Outcome = typeof outcome.enum[number];
type ReplayAnalysis = {
  version: "jumpserve-replay-analysis-v1";
  paper: { sha256: string };
  scenario: string;
  claims: Array<{ id: string; outcome: Outcome }>;
};
type Scorecard = {
  version: "jumpserve-verifier-scorecard-v1";
  paper_sha256: string; assessment_sha256: string; answer_key_sha256: string;
  split: "development" | "held_out"; mode: "fresh" | "replay"; scenario: string | null;
  evidence_integrity: { status: "verified" | "legacy_archive_matched" | "fixture_only" | "failed" };
  status: "scored" | "blocked" | "failed";
  claims: Array<{ key_claim_id: string; assessment_claim_id: string | null; reported_outcome: Outcome | null;
    supported_outcome: Outcome | null; assessment: "correct" | "incorrect" | "unscored"; evidence: string[] }>;
  rubric: Array<{ criterion: string; earned: number | null; maximum: number }>;
  score: { earned: number; applicable_maximum: number; rubric_maximum: number } | null;
  critical_failures: string[]; blockers: string[];
};

const ajv = new Ajv({ strict: true });
const validateReplay = ajv.compile<ReplayAnalysis>(REPLAY_ANALYSIS_SCHEMA);
const validateScorecard = ajv.compile<Scorecard>(VERIFIER_SCORECARD_SCHEMA);
export const MAX_REVIEWED_ASSESSMENT_BYTES = 650_000;
export const MAX_VERIFIER_REQUEST_BYTES = 1_500_000;
export const VERIFIER_VERSION_SCHEMA = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$" } as const;

export function isVerifierVersion(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/.test(value);
}

export function prepareGeneratorResult(input: unknown): { bundle: AssessmentBundle | ReplayAnalysis; hash: string } {
  if (!input || typeof input !== "object" || !("version" in input) || input.version !== "jumpserve-replay-analysis-v1") {
    return prepareAssessmentBundle(input);
  }
  if (!validateReplay(input)) throw new Error("The artifact does not match the JumpServe replay analysis schema.");
  checkAssessmentText(input);
  if (new Set(input.claims.map(claim => claim.id)).size !== input.claims.length) {
    throw new Error("Replay analysis claim identifiers must be unique.");
  }
  const json = canonicalJson(input);
  if (Buffer.byteLength(json) > 500_000) throw new Error("The replay analysis exceeds 500 KB.");
  return { bundle: input, hash: createHash("sha256").update(json).digest("hex") };
}

function samePoints(expected: number, total: number) {
  return Math.abs(expected - total) <= 1e-8;
}

export function prepareVerifierResult(raw: unknown, input: unknown) {
  if (typeof raw !== "string" || Buffer.byteLength(raw) > MAX_REVIEWED_ASSESSMENT_BYTES) {
    throw new Error("Provide the original reviewed JSON text, up to 650 KB.");
  }
  if (!validateScorecard(input)) {
    throw new Error(`Scorecard does not match jumpserve-verifier-scorecard-v1 at ${validateScorecard.errors?.[0]?.instancePath || "/"}.`);
  }
  if (createHash("sha256").update(raw).digest("hex") !== input.assessment_sha256) {
    throw new Error("The reviewed file does not match the assessment SHA-256 in this scorecard.");
  }
  checkAssessmentText(input);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("The reviewed file is invalid JSON."); }
  const { bundle, hash: generatorHash } = prepareGeneratorResult(parsed);
  if (bundle.paper.sha256 !== input.paper_sha256) throw new Error("The scorecard refers to a different paper.");
  const fixture = bundle.version === "jumpserve-replay-analysis-v1";
  if ((input.mode === "fresh") !== (input.scenario === null) ||
      fixture !== (input.evidence_integrity.status === "fixture_only") ||
      (fixture && (input.mode !== "replay" || input.scenario !== bundle.scenario))) {
    throw new Error("The evaluation mode and scenario must match the reviewed artifact.");
  }
  if ((input.status === "failed") !== (input.critical_failures.length > 0) ||
      (input.status === "blocked" && (input.score !== null || !input.blockers.length)) ||
      (input.status === "scored" && (input.score === null || input.evidence_integrity.status === "failed" ||
        !input.claims.length || !input.rubric.length))) {
    throw new Error("The scorecard status conflicts with its score, blockers, or critical failures.");
  }
  const ids = new Set<string>();
  const outcomes = new Map(bundle.claims.map(c => [c.id, c.outcome]));
  for (const claim of input.claims) {
    if (claim.evidence.some(reference => /^(?:[\\/]|[A-Za-z][A-Za-z0-9+.-]*:[\\/])|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(reference.trim()))) {
      throw new Error("Use relative evidence references in the scorecard.");
    }
    const expected = claim.assessment_claim_id === null ? null : outcomes.get(claim.assessment_claim_id);
    if (ids.has(claim.key_claim_id) || expected !== claim.reported_outcome ||
        (claim.assessment === "correct" && (expected === null || expected !== claim.supported_outcome)) ||
        (claim.assessment === "incorrect" && (claim.supported_outcome === null || expected === claim.supported_outcome))) {
      throw new Error("A scorecard claim is duplicated or inconsistent with the reviewed assessment.");
    }
    ids.add(claim.key_claim_id);
  }
  let earned = 0;
  let applicable = 0;
  let maximum = 0;
  const criteria = new Set<string>();
  for (const item of input.rubric) {
    if (criteria.has(item.criterion) || (item.earned !== null && item.earned > item.maximum)) {
      throw new Error("Rubric criteria must be unique and earned points must fit their maximum.");
    }
    criteria.add(item.criterion);
    maximum += item.maximum;
    if (item.earned !== null) {
      earned += item.earned;
      applicable += item.maximum;
    }
  }
  if (input.score && (!(applicable > 0) || !samePoints(input.score.earned, earned) ||
      !samePoints(input.score.applicable_maximum, applicable) || !samePoints(input.score.rubric_maximum, maximum))) {
    throw new Error("Score totals must match the recorded rubric entries.");
  }
  const json = canonicalJson(input);
  if (Buffer.byteLength(json) > 90_000) throw new Error("The scorecard exceeds 90 KB.");
  return { bundle, generatorHash, scorecard: input, hash: createHash("sha256").update(json).digest("hex") };
}
