import schema from "@/scripts/lib/jumpserve-synthetic-activity-schema.json";

type ActivityKind = keyof typeof schema.labels;
type ActivityEvent = { at: string; kind: ActivityKind; program?: string; exitCode?: number };

export type TrainingBatchActivity = { generator: ActivityEvent[]; verifier: ActivityEvent[] };

export function isTrainingBatchPaperId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}

function activityEvents(value: unknown): ActivityEvent[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-schema.maxEvents).flatMap(event => {
    const kind = event?.kind;
    const at = event?.at;
    if (typeof kind !== "string" || !Object.hasOwn(schema.labels, kind) ||
        typeof at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(at) ||
        !Number.isFinite(Date.parse(at))) return [];
    const safe: ActivityEvent = { at, kind: kind as ActivityKind };
    if ((kind === "command_started" || kind === "command_completed") && schema.programs.includes(event.program)) {
      safe.program = event.program;
    }
    if (kind === "command_completed" && Number.isInteger(event.exitCode) && event.exitCode >= 0 && event.exitCode <= 255) {
      safe.exitCode = event.exitCode;
    }
    return [safe];
  });
}

export function projectTrainingBatchActivity(value: unknown): TrainingBatchActivity {
  const stage = value && typeof value === "object" ? value : {};
  return {
    generator: activityEvents("generator" in stage ? stage.generator : null),
    verifier: activityEvents("verifier" in stage ? stage.verifier : null),
  };
}

export function trainingBatchActivityLabel(event: ActivityEvent) {
  const label = schema.labels[event.kind];
  const program = event.kind === "command_started" || event.kind === "command_completed" ? event.program ?? "shell command" : "";
  return [label, program, event.exitCode !== undefined ? `(exit ${event.exitCode})` : ""].filter(Boolean).join(" ");
}
