import "server-only";
import { constants } from "node:fs";
import { open, readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { isResearchId } from "@/lib/research-experiment-queue";
import { isTrainingBatchId, projectTrainingBatchSteps, type TrainingBatch, type TrainingBatchPaper } from "@/lib/training-batch";

type Journal = {
  status: "running" | "passed" | "completed" | "stopped" | "interrupted";
  started_at: string;
  finished_at?: string;
  stop?: { phase: TrainingBatch["stopPhase"] };
  guidance?: Partial<Record<"generator" | "verifier", { version_number?: number }>>;
  cases: {
    paper_id: string;
    pdf: string;
    status: TrainingBatchPaper["status"];
    database?: { assessment_id?: string; generator_result_id?: string };
    score?: { earned: number; rubric_maximum: number } | null;
    steps?: unknown;
  }[];
};
type LocalTrainingBatch = TrainingBatch & { startedAt: string };

async function journalDirectories(directory: string) {
  const [index, entries] = await Promise.all([
    readFile(join(directory, "training-batch-index.json"), "utf8"),
    readdir(directory, { withFileTypes: true }),
  ]);
  const names: unknown = JSON.parse(index);
  if (!Array.isArray(names) || !names.every(name => typeof name === "string") || new Set(names).size !== names.length) {
    throw new Error("Invalid local training batch index.");
  }
  const available = new Set(entries.filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
    .map(entry => entry.name));
  return names.flatMap((name, offset) => {
    const id = offset + 1;
    return isTrainingBatchId(id) && available.has(name) ? [{ id, file: join(directory, name, "batch.json") }] : [];
  });
}

async function loadJournal({ id, file }: { id: number; file: string }): Promise<LocalTrainingBatch | null> {
  try {
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 256_000) return null;
      const journal: Journal = JSON.parse(await handle.readFile("utf8"));
      if (!journal || !["running", "passed", "completed", "stopped", "interrupted"].includes(journal.status) ||
          !Number.isFinite(Date.parse(journal.started_at)) || !Array.isArray(journal.cases) ||
          journal.cases.some(paper => !paper || typeof paper.paper_id !== "string" ||
            typeof paper.pdf !== "string" ||
            !["pending", "generating", "verifying", "passed", "completed", "generation_error", "verification_error",
              "stopped", "interrupted"].includes(paper.status))) return null;
      return {
        id, requestedAt: null, startedAt: journal.started_at, finishedAt: journal.finished_at ?? null,
        status: journal.status, stopPhase: journal.stop?.phase ?? null,
        updatedAt: stat.mtime.toISOString(), stale: false,
        versions: {
          generator: journal.guidance?.generator?.version_number ?? null,
          verifier: journal.guidance?.verifier?.version_number ?? null,
        },
        papers: journal.cases.map(paper => ({
          id: paper.paper_id, fileName: basename(paper.pdf), status: paper.status,
          assessmentId: isResearchId(paper.database?.generator_result_id) && isResearchId(paper.database?.assessment_id)
            ? paper.database.assessment_id : null,
          score: paper.score ? { earned: paper.score.earned, maximum: paper.score.rubric_maximum } : null,
          steps: projectTrainingBatchSteps(paper.steps),
        })),
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && "code" in error &&
        (error.code === "ENOENT" || error.code === "ELOOP"))) return null;
    throw error;
  }
}

export async function readLocalTrainingBatch(directory: string, id: number) {
  const entry = (await journalDirectories(directory)).find(entry => entry.id === id);
  return entry ? loadJournal(entry) : null;
}

export async function listLocalTrainingBatches(directory: string) {
  const entries = await journalDirectories(directory);
  const batches = await Promise.all(entries.map(loadJournal));
  return batches.filter(batch => batch !== null)
    .sort((a, b) => b.id - a.id);
}
