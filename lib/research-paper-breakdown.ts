export const PAPER_BREAKDOWN_VERSION = "paper-breakdown-v1";
export const PAPER_BREAKDOWN_SECTIONS = [
  { id: "access", title: "Access", description: "Resources, devices, software, datasets and permissions described in the paper." },
  { id: "experiment", title: "Experiment", description: "Procedures, configurations, comparisons, repetitions and stopping conditions." },
  { id: "data", title: "Data", description: "Measurements, units, instruments, sampling, storage and provenance." },
  { id: "validate", title: "Validate", description: "The authors’ reported checks, baselines, uncertainty and limitations." },
] as const;
export type PaperBreakdownSection = typeof PAPER_BREAKDOWN_SECTIONS[number]["id"];
export type PaperBreakdownItem = { id: string; description: string; quote: string; page: number };
export type PaperBreakdown = {
  version: typeof PAPER_BREAKDOWN_VERSION;
  status: "preparing" | "ready" | "limited";
  source_id: string;
  text_artifact_id: string;
  text_sha256: string;
  policy_sha256: string;
  extraction_version?: "paper-intake-one-pass-v1";
  cursor: number;
  total_chunks: number;
  total_pages: number;
  missing_text_pages: number[];
  sections: Record<PaperBreakdownSection, PaperBreakdownItem[]>;
  limitation: string;
  reason: string | null;
  last_turn_id?: string;
};

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const boundedText = (value: unknown, maximum: number): value is string => typeof value === "string" && value.trim().length > 0 && [...value].length <= maximum;
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function validatePaperBreakdown(value: unknown): PaperBreakdown {
  const failure = () => new Error("The saved paper breakdown could not be verified. Reload the paper information.");
  if (!record(value) || value.version !== PAPER_BREAKDOWN_VERSION || !["preparing", "ready", "limited"].includes(String(value.status)) ||
      !boundedText(value.source_id, 100) || !boundedText(value.text_artifact_id, 100) || !hash(value.text_sha256) || !hash(value.policy_sha256) ||
      value.extraction_version !== undefined && value.extraction_version !== "paper-intake-one-pass-v1" ||
      !integer(value.cursor) || !integer(value.total_chunks) || value.cursor > value.total_chunks ||
      !integer(value.total_pages) || !Array.isArray(value.missing_text_pages) || value.missing_text_pages.length > value.total_pages ||
      !value.missing_text_pages.every(page => integer(page) && page > 0 && page <= (value.total_pages as number)) ||
      new Set(value.missing_text_pages).size !== value.missing_text_pages.length ||
      !boundedText(value.limitation, 2000) || value.reason !== null && !boundedText(value.reason, 2000) ||
      value.last_turn_id !== undefined && !boundedText(value.last_turn_id, 100) || !record(value.sections) || Object.keys(value.sections).length !== 4 ||
      value.status === "ready" && (value.total_chunks === 0 || value.cursor !== value.total_chunks) || value.status === "limited" && value.reason === null) throw failure();
  const ids = new Set<string>();
  for (const { id } of PAPER_BREAKDOWN_SECTIONS) {
    const entries = value.sections[id];
    if (!Array.isArray(entries) || entries.length > 200) throw failure();
    for (const entry of entries) {
      if (!record(entry) || !boundedText(entry.id, 100) || ids.has(entry.id) || !boundedText(entry.description, 400) ||
          !boundedText(entry.quote, 800) || !integer(entry.page) || entry.page < 1 || entry.page > value.total_pages ||
          value.missing_text_pages.includes(entry.page)) throw failure();
      ids.add(entry.id);
    }
  }
  if (ids.size > 200 || ids.size > (value.extraction_version ? 32 : value.cursor * 8)) throw failure();
  return value as PaperBreakdown;
}
