import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { ExperimentPlan } from "./paper-experiment-plan";
import type { PaperBreakdown } from "./research-paper-breakdown";
import { terminalBlockedActionRefs } from "./paper-terminal-commands";
import { STEP_COMMANDS_FORMAT, selectedCommandStep, stepCommandsInput } from "./paper-step-commands";
import { terminalCommandsRequest, TERMINAL_COMMANDS_INSTRUCTIONS } from "./paper-terminal-commands-model";

export const STEP_COMMANDS_INSTRUCTIONS = `${TERMINAL_COMMANDS_INSTRUCTIONS.replace("Cover EVERY action in its original order, including legacy flat steps.", "Generate only selected_action at action_ref; every other action is context, not requested work.")}

INDIVIDUAL STEP REQUEST: Generate commands for selected_action at action_ref ONLY. The actions object must have exactly that one key. Never implement other actions, run prerequisite scripts, acquire measurements for a later analysis action, or generate a whole-experiment program. List genuine earlier_action_refs as DATA/resource prerequisites; do not depend on their code. Cleanup covers only resources CREATED by this selected action and preserves data and resources belonging to other steps. If this action creates no resources, cleanup is manual with null commands.
Use the separate action-v1 workspace and namespace prefix supplied by the application. All independently generated steps share the step-manifest-v1 DATA contract: an action writes steps/<action_ref>/manifest.json with version="step-manifest-v1", study_id, experiment_index, action_ref, configuration, resources and outputs arrays. Each output declares its workspace-relative path, role, media_type, and schema (including columns, types and units for tabular data). Resource entries record exact ownership and identities. Consumers discover and verify actual earlier manifests and their declared formats before reading data; never assume undocumented filenames, column names, installed state, prior generation or prior execution. Do not import or execute another action's program. Stop clearly on missing, incompatible or conflicting artifacts. Keep immutable source/report provenance and raw measurements. No generation request executes these commands.`;
export function stepCommandsRequest(study: string, index: number, ref: string, plan: ExperimentPlan, breakdown: PaperBreakdown): ResponseCreateParamsNonStreaming {
  const { earlier } = selectedCommandStep(plan, index, ref);
  const request = terminalCommandsRequest(study, index, plan, breakdown);
  const schema = request.text!.format as { type: string; name: string; strict: boolean; schema: Record<string, unknown> };
  const properties = schema.schema.properties as Record<string, Record<string, unknown>>;
  const actions = properties.actions.properties as Record<string, Record<string, unknown>>;
  const action = structuredClone(actions[ref]);
  const blockProperties = action.properties as Record<string, Record<string, unknown>>;
  blockProperties.prerequisites = { type: "array", maxItems: earlier.length ? 24 : 0, items: { type: "string", ...(earlier.length ? { enum: earlier } : {}) } };
  properties.actions = { type: "object", additionalProperties: false, required: [ref], properties: { [ref]: action } };
  const cleanup = properties.cleanup.properties as Record<string, Record<string, unknown>>;
  cleanup.prerequisites = { type: "array", maxItems: 24, items: { type: "string", enum: [...earlier, ref] } };
  if (terminalBlockedActionRefs(plan, index, breakdown).includes(ref)) { cleanup.kind = { type: "string", enum: ["manual", "blocked"] };cleanup.commands = { type: "null" };cleanup.needs_sudo = { type: "boolean", enum: [false] }; }
  const input = JSON.stringify(stepCommandsInput(study, index, ref, plan, breakdown));
  if (Buffer.byteLength(input) > 100000) throw new Error("The confirmed step exceeds the command input limit.");
  return { ...request, instructions: STEP_COMMANDS_INSTRUCTIONS, input, max_output_tokens: 16000, text: { ...request.text, format: { ...schema, type: "json_schema" as const, name: STEP_COMMANDS_FORMAT } } };
}
