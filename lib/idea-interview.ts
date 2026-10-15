import { GUIDE_QUESTIONS, type GuideQuestion } from "./idea-guide";
import type { IdeaRun, IdeaState } from "./research-ideas";

export const INTERVIEW_VERSION = "idea-interview-v1";
export function interviewDetails(run: IdeaRun) {
  const value = run.provenance.interview;
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== INTERVIEW_VERSION) return null;
  const metadata = value as { version: string; owner_message?: unknown };
  const message = run.provenance.provider_message as { content?: { toolUse?: { name?: string; input?: { field?: unknown } } }[] } | undefined;
  const tool = Array.isArray(message?.content) && message.content.length === 1 ? message.content[0]?.toolUse : undefined;
  return { ...metadata, field: tool?.name === "submit_idea_question" ? tool.input?.field : undefined };
}

// A failed/latest turn or a changed packet cannot revive an older AI question.
export function interviewQuestion(state: IdeaState, preferred?: GuideQuestion) {
  const latest = state.runs.filter(run => run.task === "planning" && run.packet_id === state.current_packet_id && interviewDetails(run)).at(-1);
  const details = latest && interviewDetails(latest);
  const field = GUIDE_QUESTIONS.find(question => question.id === details?.field);
  if (!latest || latest.status !== "complete" || !field || preferred && preferred.id !== field.id || latest.output?.questions.length !== 1) return null;
  return { run: latest, field, text: latest.output.questions[0] };
}

export function interviewTurns(state: IdeaState) {
  const answers = state.packets.flatMap(packet => {
    const field = GUIDE_QUESTIONS.find(question => packet.reason === `Guided answer: ${question.label}`);
    return field ? [{ kind: "answer" as const, packet, field, created_at: packet.created_at }] : [];
  });
  const replies = state.runs.filter(run => run.task === "planning").map(run => ({ kind: "reply" as const, run, created_at: run.created_at }));
  return [...answers, ...replies].sort((a, b) => a.created_at.localeCompare(b.created_at));
}
