"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, CircleHelp, MessageCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { researchRequest, ResearchRequestError } from "@/lib/research-workflow-api";
import { ideaModelRequest, IdeaRequestError } from "@/lib/research-idea-api";
import { emptyIdea, ideaReview, type IdeaDocument, type IdeaPacket, type IdeaState } from "@/lib/research-ideas";
import { answerQuestion, answered, GUIDE_QUESTIONS, guideAnswer, guideProgress, protocolDraft, type GuideQuestion } from "@/lib/idea-guide";
import { INTERVIEW_VERSION, interviewDetails, interviewQuestion, interviewTurns } from "@/lib/idea-interview";
import { IdeaReviewSources } from "./idea-review-sources";
import { IdeaConversation } from "./idea-conversation";
import { NetworkProtocolEditor } from "./network-protocol-editor";
import { ResearchSelect } from "./select";

const errorText = (error: unknown) => error instanceof Error ? error.message : "The request was not confirmed. Your answer is still here.";
const PHASES = ["Describe the idea", "Design the test", "Set up execution", "Check the plan", "Run the experiment"];
type SaveRequest = { action: string; request_id: string; supersedes_id: string | null; document: IdeaDocument; reason: string };

function AnswerComposer({ plan, question, disabled, helpDisabled, onSave, onHelp, onDirty, onDiscard, conversational }: {
  plan: IdeaDocument; question: GuideQuestion; disabled: boolean; helpDisabled: boolean; conversational: boolean;
  onSave: (document: IdeaDocument, reason: string) => Promise<void>; onHelp: (question: GuideQuestion, draft: string) => Promise<void>;
  onDirty: () => void; onDiscard: () => void;
}) {
  const [answer, setAnswer] = useState(() => guideAnswer(plan, question));
  const existing = plan.protocol?.[question.id] as { applicable?: boolean } | undefined;
  const [applicable, setApplicable] = useState(existing?.applicable === true ? "yes" : existing?.applicable === false ? "no" : "");
  const [error, setError] = useState("");
  function changed(value: string) { setAnswer(value); setError(""); onDirty(); }
  async function save(event: FormEvent) {
    event.preventDefault(); setError("");
    try { await onSave(answerQuestion(plan, question, answer, applicable === "" ? undefined : applicable === "yes"), `Guided answer: ${question.label}`); }
    catch (failure) { setError(errorText(failure)); }
  }
  return <form onSubmit={event => void save(event)} className="space-y-4" aria-label="Answer the research guide">
    {question.format === "applicability" ? <ResearchSelect label={`${question.label} applicability`} value={applicable} onChange={value => { if (!disabled) { setApplicable(value); onDirty(); } }} options={[{ value: "", label: "Choose whether this applies" }, { value: "yes", label: "Applicable — specify the method" }, { value: "no", label: "Inapplicable — explain why" }]} /> : null}
    {question.format === "origin" ? <ResearchSelect label="Your answer" value={answer} onChange={value => { if (!disabled) changed(value); }} options={[
      { value: "", label: "Choose the observation origin" }, { value: "new-empirical", label: "New measurements of an actual or emulated system" },
      { value: "simulation", label: "Simulated system outputs" }, { value: "archived-data", label: "Previously recorded data" },
      { value: "model-output", label: "Model outputs" }, { value: "software-fixture", label: "Software verification fixtures" }, { value: "mixed", label: "Mixed origins — explain their separation in the methods" },
    ]} /> : question.format === "integer" ? <label className="block space-y-2 text-sm"><span className="font-medium">Your answer</span><Input aria-label="Your answer" type="number" min={1} max={10000} required disabled={disabled} value={answer} onChange={event => changed(event.target.value)} /></label> : <label className="block space-y-2 text-sm"><span className="font-medium">Your answer</span><Textarea aria-label="Your answer" aria-describedby="current-guide-question current-guide-help" className="min-h-28 text-foreground" required maxLength={5000} disabled={disabled} value={answer} onChange={event => changed(event.target.value)} placeholder={conversational ? "Tell me what you know, or ask the guide below if you are unsure." : question.example ?? "Write what you know. Ask for help if you are unsure."} /></label>}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={disabled || !answer.trim() || (question.format === "applicability" && !applicable)}>{conversational ? "Send answer" : "Save answer and continue"}</Button><Button type="button" variant="outline" disabled={disabled || helpDisabled} onClick={() => void onHelp(question, answer)}><CircleHelp /> Help me answer</Button><Button type="button" variant="ghost" disabled={disabled} onClick={() => { setAnswer(guideAnswer(plan, question)); setApplicable(existing?.applicable === true ? "yes" : existing?.applicable === false ? "no" : ""); setError(""); onDiscard(); }}>Discard unsaved answer</Button></div>
    <p className="text-xs text-muted-foreground">Your answer is saved as you wrote it. AI suggestions stay separate until you choose what to record. You can return to earlier answers.</p>
  </form>;
}

export function IdeaGuide({ state, studyId, dirty, advancedDirty, active, campaignEditing, onDirty, onDiscard, reload, children }: {
  state: IdeaState; studyId: string; dirty: boolean; advancedDirty: boolean; onDirty: () => void; onDiscard: () => void;
  reload: (expectedPacketId?: string) => Promise<void>; children: React.ReactNode; active: boolean; campaignEditing: boolean;
}) {
  const progress = guideProgress(state);
  const packet = state.packets.find(row => row.id === state.current_packet_id);
  const plan = packet?.document ?? emptyIdea();
  const [selected, setSelected] = useState<{ id: string; packetId: string | null } | null>(null);
  const [conversation, setConversation] = useState(true);
  const [followUp, setFollowUp] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [saveRequest, setSaveRequest] = useState<SaveRequest | null>(null);
  const [compiled, setCompiled] = useState<Record<string, unknown> | null>(null);
  const [configure, setConfigure] = useState(false);
  const [configurationRevision, setConfigurationRevision] = useState(0);
  const [approval, setApproval] = useState({ packetId: state.current_packet_id, checked: false, reason: "" });
  const approved = approval.packetId === state.current_packet_id && approval.checked;
  const rationale = approval.packetId === state.current_packet_id ? approval.reason : "";
  function setApproved(checked: boolean) { setApproval(previous => ({ packetId: state.current_packet_id, checked, reason: previous.packetId === state.current_packet_id ? previous.reason : "" })); }
  function setRationale(reason: string) { setApproval(previous => ({ packetId: state.current_packet_id, reason, checked: previous.packetId === state.current_packet_id && previous.checked })); }
  const controller = useRef<AbortController | null>(null);
  const modelRequests = useRef<Partial<Record<"planning" | "comprehension" | "critic", Record<string, unknown>>>>({});
  const session = useRef([...state.runs].reverse().find(run => run.task === "planning")?.session_id ?? "");
  const acceptRequest = useRef<Record<string, unknown> | null>(null);
  const [retryModel, setRetryModel] = useState<"planning" | "comprehension" | "critic" | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const chosenQuestion = selected && selected.packetId === state.current_packet_id ? GUIDE_QUESTIONS.find(q => q.id === selected.id) : undefined;
  const tailored = interviewQuestion(state, chosenQuestion);
  const activeQuestion = conversation ? tailored?.field : chosenQuestion ?? progress.unanswered[0];
  const needsQuestion = progress.unanswered.length > 0 || !!chosenQuestion;
  const phase = progress.stage === "idea" ? 0 : progress.stage === "methods" ? 1 : progress.stage === "configuration" ? 2 : progress.stage === "run" ? 4 : 3;
  const unconfirmedSave = saveRequest && !state.packets.some(p => p.id === saveRequest.request_id);
  const unconfirmedModel = retryModel && !state.runs.some(run => run.id === modelRequests.current[retryModel]?.request_id && run.status !== "running");
  const disabled = busy || advancedDirty || campaignEditing || !!unconfirmedSave || !!unconfirmedModel;
  const currentReviews = state.runs.filter(run => run.packet_id === state.current_packet_id && run.task !== "planning");
  const turns = interviewTurns(state);
  const budgetReached = (["comprehension", "critic"] as const).some(task => !ideaReview(state, task) && currentReviews.filter(run => run.task === task).length >= 3);
  const runningReview = (["comprehension", "critic"] as const).some(task => currentReviews.filter(run => run.task === task).at(-1)?.status === "running");

  async function persist(request: SaveRequest) {
    setBusy(true); setMessage(""); setSaveRequest(request);
    try {
      const saved = await researchRequest<IdeaPacket>(`/studies/${studyId}/idea`, { method: "POST", body: JSON.stringify(request) });
      if (saved.id !== request.request_id || saved.study_id !== studyId || saved.supersedes_id !== request.supersedes_id) throw new Error("Saved answer identity was not confirmed. Refresh retained status before continuing.");
      await reload(saved.id); setSaveRequest(null); setSelected(null); setCompiled(null); setConfigure(false); setApproved(false); setRationale(""); onDiscard();
      setMessage(`Answer saved in plan version ${saved.version}. Earlier answers and reviews are preserved.`);
      return saved;
    } catch (failure) { if (failure instanceof ResearchRequestError && failure.status >= 400 && failure.status < 500) setSaveRequest(null); setMessage(errorText(failure)); return null; }
    finally { setBusy(false); }
  }
  async function save(document: IdeaDocument, reason: string) {
    if (busy || advancedDirty) return;
    if (JSON.stringify(document) === JSON.stringify(plan)) { setSelected(null); onDiscard(); if (conversation) await converse("This answer is unchanged. Ask the next useful question, clarifying it if needed."); else setMessage("This answer is already saved. Continue with the next unresolved question."); return; }
    if (new TextEncoder().encode(JSON.stringify(document)).length > 24000) { setMessage("This answer would exceed the plan's 24 KB storage limit. Shorten the plan or use private experiment inputs for large files."); return; }
    const saved = await persist({ action: "save", request_id: crypto.randomUUID(), supersedes_id: state.current_packet_id, document, reason });
    if (saved && conversation && reason.startsWith("Guided answer: ") && GUIDE_QUESTIONS.some(question => !answered(document, question))) {
      await converse(`I saved my answer about ${activeQuestion?.label ?? "the plan"}: ${activeQuestion ? guideAnswer(document, activeQuestion).slice(0, 2400) : "See the current packet."}
Acknowledge it and ask the most useful next question, or clarify this answer if it is ambiguous.`, saved.id);
    }
  }
  async function model(task: "planning" | "comprehension" | "critic", extra: Record<string, unknown> = {}) {
    const retained = modelRequests.current[task];
    const terminal = retained && state.runs.some(run => run.id === retained.request_id && run.status !== "running");
    const request = retained && !terminal ? retained : { request_id: crypto.randomUUID(), study_id: studyId, packet_id: state.current_packet_id, task, ...extra };
    modelRequests.current[task] = request; controller.current = new AbortController();
    let result;
    try { result = await ideaModelRequest(request, controller.current.signal); }
    catch (error) { if (error instanceof IdeaRequestError && !error.uncertain) { delete modelRequests.current[task]; setRetryModel(null); } throw error; }
    await reload();
    if (result.run.status === "running") { setRetryModel(task); throw new Error("This AI attempt is still running. Refresh its status; do not start another call."); }
    delete modelRequests.current[task]; setRetryModel(null);
    return result.run;
  }
  async function converse(message = "Use my saved idea to ask the most useful next planning question.", packetId = state.current_packet_id, preferredField?: string) {
    if (!packetId || unconfirmedModel) return;
    setBusy(true); setMessage("");
    // Full saved plan accompanies every turn. Rotate before bounded history fills;
    // earlier turns remain in research_idea_runs and the visible transcript.
    const historyRuns = state.runs.filter(run => run.session_id === session.current);
    const historyBytes = new TextEncoder().encode(JSON.stringify(historyRuns.map(run => ({ output: run.output, interview: interviewDetails(run) })))).length;
    if (!session.current || historyRuns.length >= 4 || historyBytes > 5000) session.current = crypto.randomUUID();
    try {
      const run = await model("planning", { packet_id: packetId, session_id: session.current, message, interview_version: INTERVIEW_VERSION, ...(preferredField ? { preferred_field: preferredField } : {}) });
      if (run.status !== "complete") setMessage(`AI turn retained: ${run.status}. ${run.reason ?? "Inspect the saved attempt before continuing."}`);
      else setFollowUp("");
    } catch (failure) { if (!(failure instanceof IdeaRequestError) || failure.uncertain) setRetryModel("planning"); setMessage(errorText(failure)); }
    finally { setBusy(false); }
  }
  async function help(question: GuideQuestion, draft: string) {
    if (!packet || unconfirmedModel) return;
    if (conversation) { await converse(`Help me think through ${question.label}. My unsaved draft (not a recorded fact): ${draft.slice(0, 2400)}`, packet.id, question.id); return; }
    setBusy(true); setMessage("");
    session.current ||= crypto.randomUUID();
    const guidance = `Help me answer this planning question: ${question.question}\nTopic: ${question.label}. ${question.help}\nMy unsaved draft (not an established fact): ${draft.slice(0, 2500)}\nAsk a focused clarification and explain any options. Do not invent missing answers or imply the experiment has run.`;
    try { const run = await model("planning", { session_id: session.current, message: guidance }); setMessage(run.status === "complete" ? "AI guidance is below. Choose your answer and save it; this call does not edit or approve the plan." : `AI help attempt retained: ${run.status}. ${run.reason ?? "Refresh its recorded details."}`); }
    catch (failure) { if (!(failure instanceof IdeaRequestError) || failure.uncertain) setRetryModel("planning"); setMessage(errorText(failure)); }
    finally { setBusy(false); }
  }
  async function checkPlan() {
    if (dirty || !progress.canReview || runningReview) return;
    setBusy(true); setMessage("");
    let task: "comprehension" | "critic" = "comprehension";
    try {
      for (task of ["comprehension", "critic"] as const) {
        if (ideaReview(state, task)) continue;
        const run = await model(task);
        if (run.status !== "complete" || run.output?.verdict !== "ready" || run.output.questions.length || run.output.findings.some(f => f.severity === "blocking")) {
          setMessage("The plan needs another look. Address the questions below and save any changes before checking again."); return;
        }
      }
      setMessage("Both fresh reviews passed. Read the plan summary, then record your approval before preparing an experiment.");
    } catch (failure) { if (!(failure instanceof IdeaRequestError) || failure.uncertain) setRetryModel(task); setMessage(errorText(failure)); }
    finally { setBusy(false); }
  }
  async function accept(event: FormEvent) {
    event.preventDefault(); const comprehension = ideaReview(state, "comprehension"), critic = ideaReview(state, "critic");
    if (!approved || !rationale.trim() || dirty || !progress.canAccept || !comprehension || !critic) return;
    setBusy(true); setMessage("");
    if (acceptRequest.current?.packet_id !== state.current_packet_id) acceptRequest.current = null;
    acceptRequest.current ||= { action: "accept", request_id: crypto.randomUUID(), packet_id: state.current_packet_id, comprehension_run_id: comprehension.id, critic_run_id: critic.id, reason: rationale };
    try { await researchRequest(`/studies/${studyId}/idea`, { method: "POST", body: JSON.stringify(acceptRequest.current) }); await reload(); acceptRequest.current = null; setMessage("Plan readiness accepted. Next, freeze the configuration and explicitly queue the experiment."); }
    catch (failure) { setMessage(errorText(failure)); }
    finally { setBusy(false); }
  }

  return <section className="space-y-5" aria-label="Guided experiment planning">
    <ol className="grid grid-cols-5 gap-2 text-xs" aria-label="Experiment planning progress">{PHASES.map((label, index) => <li key={label} aria-current={index === phase ? "step" : undefined} className={`flex flex-col items-center gap-1 rounded-md border p-2 sm:flex-row sm:gap-2 sm:p-3 ${index === phase ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground"}`}>{index < phase ? <Check className="size-4 shrink-0" aria-hidden /> : <span className="shrink-0">{index + 1}.</span>}<span className="sr-only sm:not-sr-only">{label}</span></li>)}</ol><p className="text-sm font-medium sm:hidden">Step {phase + 1} of {PHASES.length} · {PHASES[phase]}</p>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-4 rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2"><MessageCircle className="size-5 text-primary" /><h2 className="text-lg font-semibold">Let’s build your experiment</h2></div>
        <p className="text-sm text-muted-foreground">We’ll turn your idea into an experiment through a conversation. The AI uses your saved plan and latest answer to ask a focused question. You choose what to record; every change keeps its history.</p>
        {plan.question ? <p className="rounded-md border p-3 text-sm"><span className="font-medium">Your research question: </span>{plan.question}</p> : null}
        <Button type="button" variant="outline" size="sm" disabled={disabled || dirty} onClick={() => { setConversation(value => !value); setSelected(null); }}>{conversation ? "Use checklist instead" : "Return to conversation"}</Button>
        <IdeaConversation state={state} active={active} />
        {advancedDirty ? <p role="status" className="rounded-md border p-3 text-sm">You have unsaved changes in the detailed editor. Save or discard them there before continuing the guide.</p> : null}
        {conversation && needsQuestion && !activeQuestion ? <div className="space-y-3 rounded-lg bg-muted p-4" aria-label="Start tailored planning"><h3 className="font-semibold">{chosenQuestion ? `Let’s discuss ${chosenQuestion.label.toLowerCase()}` : "Let’s find the next useful question for your idea"}</h3><p className="text-sm">The guide will read your saved plan before asking. Each turn requests one AI response; opening this page does not call the model.</p><Button disabled={disabled || dirty || !packet} onClick={() => void converse(undefined, state.current_packet_id, chosenQuestion?.id)}>{turns.length ? "Continue conversation" : "Start conversation"}</Button>{chosenQuestion ? <Button variant="ghost" disabled={disabled || dirty} onClick={() => setSelected(null)}>Return to the next step</Button> : null}</div> : null}
        {plan && activeQuestion ? <>
          <article className="space-y-2 rounded-lg bg-muted p-4" aria-label="Current guide question"><p className="text-xs font-medium text-muted-foreground">Research guide · {activeQuestion.section === "idea" ? "Describe the idea" : "Design the test"}</p><h3 id="current-guide-question" className="text-base font-semibold">{conversation ? tailored?.text : activeQuestion.question}</h3><p id="current-guide-help" className="text-sm">{conversation ? `Your answer will be recorded under “${activeQuestion.label}”. You can ask for advice below before answering.` : activeQuestion.help}</p></article>
          <AnswerComposer key={`${packet?.id}:${activeQuestion.id}`} plan={plan} question={activeQuestion} disabled={disabled} helpDisabled={!packet || !!unconfirmedModel} onSave={save} onHelp={help} onDirty={onDirty} onDiscard={onDiscard} conversational={conversation} />
          {chosenQuestion ? <Button type="button" variant="outline" size="sm" disabled={disabled || dirty} onClick={() => setSelected(null)}>Return to the next step</Button> : null}
        </> : !needsQuestion ? <>
          <article className="space-y-2 rounded-lg bg-muted p-4" aria-label="Current guide question"><p className="text-xs font-medium text-muted-foreground">Research guide · {PHASES[phase]}</p><h3 className="text-base font-semibold">{phase === 2 ? "How should JumpServe execute this experiment?" : phase === 4 ? "Your reviewed plan is ready to prepare an experiment." : "Let’s check for gaps before running anything."}</h3><p className="text-sm">{phase === 2 ? "Choose the runner that matches your methods, specify the actual configuration, and confirm the repetitions and resource limits." : phase === 4 ? "Preparation freezes the reviewed plan. Queueing is the separate action that requests execution; monitor retained jobs and measurements below." : "Required answers are recorded. Fresh comprehension and critic reviews must agree that the current plan has no unresolved questions or blocking findings."}</p></article>
          {(phase === 2 || configure) && plan ? <div className="space-y-3"><NetworkProtocolEditor key={`${packet?.id}:${configurationRevision}`} studyId={studyId} document={plan} protocol={JSON.stringify(compiled ?? protocolDraft(plan))} guided onEditing={() => { setCompiled(null); onDirty(); }} onChange={value => { setCompiled(JSON.parse(value)); onDirty(); }} />{compiled ? <Button type="button" disabled={disabled} onClick={() => void save({ ...plan, protocol: compiled }, "Guided setup: executable configuration, measurements and resource limits")}>Save experiment configuration</Button> : null}<Button type="button" variant="ghost" disabled={disabled} onClick={() => { setCompiled(null); setConfigurationRevision(value => value + 1); onDiscard(); setMessage("Unsaved setup changes discarded. The saved plan is unchanged."); }}>Discard setup changes</Button></div> : null}
          {phase === 3 ? <div className="space-y-4">
            {state.missing.length ? <div className="rounded-md border p-3 text-sm"><p className="font-medium">The saved plan still needs attention:</p><ul className="mt-2 list-disc space-y-1 pl-5">{state.missing.map(item => <li key={item} className="break-words">{GUIDE_QUESTIONS.find(q => q.id === item)?.label ?? item}</li>)}</ul></div> : null}
            <Button disabled={disabled || dirty || !!unconfirmedModel || !progress.canReview || runningReview || budgetReached} onClick={() => void checkPlan()}>{busy ? "Checking the saved plan…" : "Check this plan before running"}</Button>
            {runningReview ? <p role="status" className="text-sm">A review is still running. Refresh retained status before continuing.</p> : null}
            {budgetReached ? <p className="text-sm">This plan version has used its three attempts for a review task. Address substantive gaps and save a changed version; identical versions cannot reset the budget.</p> : null}
            {progress.canAccept && !state.ready ? <form onSubmit={event => void accept(event)} className="space-y-3 rounded-md border p-4"><h3 className="font-medium">Approve the final plan</h3><p className="text-sm">Review the saved answers and setup. AI recommendations do not establish scientific validity; execution will use these exact settings.</p><label className="flex items-start gap-2 text-sm"><Checkbox disabled={disabled || dirty} checked={approved} onCheckedChange={value => setApproved(value === true)} />I have checked the plan, execution settings, and review findings.</label><label className="block space-y-1 text-sm"><span>Approval rationale</span><Input aria-label="Approval rationale" required maxLength={2000} disabled={disabled || dirty} value={rationale} onChange={event => { setRationale(event.target.value); acceptRequest.current = null; }} placeholder="Explain how the questions and findings were addressed." /></label><Button type="submit" disabled={disabled || dirty || !approved || !rationale.trim()}>Approve reviewed plan</Button></form> : null}
          </div> : null}
          {phase === 4 && active ? children : null}
          {phase !== 2 && plan ? <Button variant="outline" size="sm" disabled={disabled || dirty} onClick={() => setConfigure(value => !value)}>{configure ? "Close execution settings" : "Review execution settings"}</Button> : null}
        </> : null}
        {conversation && packet && needsQuestion ? <form className="space-y-2 rounded-md border p-3" aria-label="Ask the research guide" onSubmit={event => { event.preventDefault(); if (followUp.trim() && !disabled) void converse(`Question for the guide: ${followUp.trim()}`, state.current_packet_id, activeQuestion?.id ?? chosenQuestion?.id); }}><label className="block space-y-2 text-sm"><span className="font-medium">Ask the guide</span><Textarea aria-label="Ask the guide" maxLength={2500} disabled={disabled} value={followUp} onChange={event => setFollowUp(event.target.value)} placeholder="Ask about this question, compare options, or say what is unclear." /></label><Button type="submit" variant="outline" disabled={disabled || !followUp.trim()}>Send question</Button><p className="text-xs text-muted-foreground">This stays in the discussion. It does not change your saved plan.</p></form> : null}
        {currentReviews.length ? <div className="space-y-3"><h3 className="font-medium">What the fresh reviews found</h3>{(["comprehension", "critic"] as const).map(task => { const run = currentReviews.filter(r => r.task === task).at(-1); return run ? <article key={run.id} className="space-y-2 rounded-md border p-3 text-sm"><p className="font-medium">{task === "comprehension" ? "Does the plan stand on its own?" : "Does the design withstand criticism?"} · {run.status} · {ideaReview(state, task) ? "Passed" : "Needs attention"}</p><p className="whitespace-pre-wrap">{run.output?.summary ?? run.reason ?? "Waiting for a recorded answer."}</p>{run.output?.questions.map(q => <p key={q}>{q}</p>)}{run.output?.findings.map((f, index) => { const question = GUIDE_QUESTIONS.find(q => q.id === f.field || q.label.toLowerCase() === f.field.toLowerCase()); return <div key={index}><p>{f.severity}: {f.message}</p>{question ? <Button variant="outline" size="sm" disabled={disabled || dirty} onClick={() => setSelected({ id: question.id, packetId: state.current_packet_id })}>Revise {question.label.toLowerCase()}</Button> : null}</div>; })}<IdeaReviewSources run={run} packet={state.packets.find(value => value.id === run.packet_id)} /><p className="text-xs text-muted-foreground">AI review · {run.model_id} · saved plan version {packet?.version}. Fresh context; independent scientific review is not asserted.</p></article> : null; })}</div> : null}
        {busy ? <p role="status" className="text-sm text-muted-foreground">Working on your request… Your saved plan and earlier turns remain available.</p> : null}
        {message ? <p role="status" className="rounded-md border p-3 text-sm">{message}</p> : null}
        {unconfirmedSave ? <Button variant="outline" disabled={busy} onClick={() => void persist(saveRequest!)}>Retry saving the same answer</Button> : null}
        {unconfirmedModel && !runningReview ? <Button variant="outline" disabled={busy} onClick={() => { setBusy(true); void model(retryModel!).catch(error => setMessage(errorText(error))).finally(() => setBusy(false)); }}>Retry the same AI request</Button> : null}
        {session.current && state.runs.filter(run => run.session_id === session.current).length >= 12 ? <Button variant="outline" disabled={busy || !!unconfirmedModel} onClick={() => { session.current = ""; delete modelRequests.current.planning; setMessage("The next help request starts a new planning conversation with the saved plan."); }}>Start a new AI coaching conversation</Button> : null}
      </div>
      <aside className="space-y-4 rounded-lg border p-4 text-sm" aria-label="Experiment readiness checklist"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><h2 className="font-semibold">Before we can run</h2></div><p>{progress.answeredCount} of {GUIDE_QUESTIONS.length} planning questions answered. This is a completeness count, not a confidence score.</p><progress className="h-2 w-full accent-primary" aria-label="Answered planning questions" value={progress.answeredCount} max={GUIDE_QUESTIONS.length} /><ul className="space-y-2">{[
        ["Research idea described", !progress.unanswered.some(q => q.section === "idea")], ["Methods and decision rules recorded", !progress.unanswered.some(q => q.section === "methods")],
        ["Executable setup saved", progress.configured], ["Comprehension review passed", !!ideaReview(state, "comprehension")], ["Critic review passed", !!ideaReview(state, "critic")], ["Your approval recorded", state.ready],
      ].map(([label, done]) => <li key={String(label)} className="flex gap-2"><span className={done ? "text-primary" : "text-muted-foreground"}>{done ? "✓" : "○"}</span>{String(label)}<span className="sr-only">{done ? ": complete" : ": incomplete"}</span></li>)}</ul>{dirty ? <p role="status" className="text-xs">Unsaved changes block reviews and launch. Save or discard the current answer first.</p> : null}<details><summary className="cursor-pointer font-medium">Review saved answers</summary><div className="mt-3 space-y-3">{GUIDE_QUESTIONS.map(q => <div key={q.id} className="space-y-1"><Button className="h-auto justify-start whitespace-normal px-0 text-left" variant="link" size="sm" disabled={disabled || dirty} onClick={() => setSelected({ id: q.id, packetId: state.current_packet_id })}>{q.label} · {plan && answered(plan, q) ? "answered" : "still needed"}</Button>{plan && guideAnswer(plan, q) ? <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{guideAnswer(plan, q)}</p> : null}</div>)}</div></details><p className="text-xs text-muted-foreground">Conversation questions are generated from your saved idea and answers. The checklist tracks coverage; it does not judge answer quality. Fresh reviews and your approval still gate execution.</p></aside>
    </div>
  </section>;
}
