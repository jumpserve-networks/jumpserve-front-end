import { prepareUploadedPaper, type PaperUploadTicket } from "./research-paper-upload";
import { ASSESSMENT_STATUS_VERSION, activityKey, parseAssessmentSummary, type AssessmentActivity, type AssessmentSummary } from "./assessment-notifications";
import { assessmentSummaryFromPublicQueue, loadPublicStudyQueue } from "./research-public-queue";

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
type Kind = "ready" | "failed";
type Phase = "queued" | "uploading" | "preparing" | "ready" | "failed" | "confirmed";
export type PaperUploadItem = { id: string; filename: string; title: string; phase: Phase; message: string; retryable: boolean };
export type PaperNotice = { id: string; title: string; kind: Kind };
export type PaperUploadState = { uploads: PaperUploadItem[]; notices: PaperNotice[]; activity: AssessmentActivity[]; error: string; persistenceError: string };
type Study = { id: string; title: string; paper_review_status?: "preparing" | "ready" | "failed" | "confirmed"; study_kind?: string; assessment_status?: AssessmentSummary | null; assessment_status_error?: string };
type OwnerStudyList = { access: string; studies: Study[]; assessment_status_version?: string };
type Preferences = { seen: { id: string; kind: Kind }[]; dismissed: string[]; activity: { tracked: string[]; dismissed: string[] } };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const EMPTY: PaperUploadState = { uploads: [], notices: [], activity: [], error: "", persistenceError: "" };
export const PAPER_STATUS_POLL_MS = 10_000;
export const PAPER_UPLOAD_PARALLELISM = 3;
export const PAPER_STATUS_PARALLELISM = 2;
const FINISHED_STATUS_CACHE_MS = 60_000;
const key = (id: string, kind: Kind) => `${id}:${kind}`;

export function parsePaperNoticePreferences(raw: string | null): Preferences {
  if (raw === null) return { seen: [], dismissed: [], activity: { tracked: [], dismissed: [] } };
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.seen) || value.seen.length > 200 || !value.seen.every((n: { id: string; kind: Kind }) => n && ID.test(n.id) && ["ready", "failed"].includes(n.kind)) || !Array.isArray(value.dismissed) || value.dismissed.length > 200 || !value.dismissed.every((n: unknown) => typeof n === "string" && /^[a-f0-9-]{36}:(ready|failed)$/i.test(n))) throw new Error("Saved notification preferences are invalid.");
  const activity = value.activity ?? { tracked: [], dismissed: [] };
  if (!Array.isArray(activity.tracked) || activity.tracked.length > 200 || !activity.tracked.every((id: unknown) => typeof id === "string" && ID.test(id)) || !Array.isArray(activity.dismissed) || activity.dismissed.length > 200 || !activity.dismissed.every((id: unknown) => typeof id === "string" && /^[a-f0-9-]{36}:(preparing|assessing|finished)$/i.test(id))) throw new Error("Saved assessment notification preferences are invalid.");
  return { seen: value.seen, dismissed: value.dismissed, activity };
}

function ownerStudies(value: OwnerStudyList) {
  if (!value || value.access !== "owner-drafts" || !Array.isArray(value.studies) || value.studies.length > 100 || !value.studies.every(s => s && ID.test(s.id) && typeof s.title === "string" && s.title.length <= 300 && (s.paper_review_status === undefined || ["preparing", "ready", "failed", "confirmed"].includes(s.paper_review_status))) || new Set(value.studies.map(s => s.id)).size !== value.studies.length) throw new Error("Paper preparation status could not be verified.");
  if (value.assessment_status_version !== undefined && value.assessment_status_version !== ASSESSMENT_STATUS_VERSION) throw new Error("Assessment notification version is unsupported; current progress is unknown.");
  return value.studies.filter(s => s.study_kind !== "idea" && (s.paper_review_status !== undefined || s.assessment_status != null)).map(s => ({ ...s, assessment_status: parseAssessmentSummary(s.assessment_status) }));
}

/** One authenticated browser's uploads. Preparation itself remains in Supabase/the worker. */
export class PaperUploadManager {
  private state: PaperUploadState = EMPTY;
  private listeners = new Set<() => void>();
  private active = false;
  private generation = 0;
  private pending = 0;
  private pollingGeneration: number | null = null;
  private refreshAgain = false;
  private timer?: ReturnType<typeof setTimeout>;
  private lifecycle = new AbortController();
  private files = new Map<string, File>();
  private preferences: Preferences = { seen: [], dismissed: [], activity: { tracked: [], dismissed: [] } };
  private storage?: Storage;
  readonly storageKey: string;
  readonly ownerId: string | null;
  private request: Request;
  private upload: (ticket: PaperUploadTicket, file: File) => Promise<void>;
  private readQueue: typeof loadPublicStudyQueue;
  private finishedStatuses = new Map<string, { summary: AssessmentSummary; readAt: number }>();

  constructor(ownerId: string | null, request: Request,
    upload: (ticket: PaperUploadTicket, file: File) => Promise<void>, readQueue = loadPublicStudyQueue) {
    this.ownerId = ownerId; this.request = request; this.upload = upload;
    this.readQueue = readQueue;
    this.storageKey = `jumpserve.paper-notices.v1.${ownerId}`;
  }
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  getSnapshot = () => this.state;
  getServerSnapshot = () => EMPTY;
  private set(value: Partial<PaperUploadState>) { this.state = { ...this.state, ...value }; this.listeners.forEach(fn => fn()); }
  private patch(id: string, value: Partial<PaperUploadItem>) { this.set({ uploads: this.state.uploads.map(u => u.id === id ? { ...u, ...value } : u) }); }
  start(storage?: Storage) {
    this.active = true; this.lifecycle = new AbortController(); this.storage = storage;
    if (!this.ownerId) return;
    if (!storage) this.set({ persistenceError: "Browser storage is unavailable. Dismissed popups may reappear after reloading." });
    try { this.preferences = parsePaperNoticePreferences(storage?.getItem(this.storageKey) ?? null); }
    catch { this.set({ persistenceError: "Notification preferences could not be restored. Dismissed popups may reappear after reloading." }); }
    void this.refresh();
  }
  stop() { this.active = false; this.generation++; this.lifecycle.abort(); clearTimeout(this.timer); this.files.clear(); this.finishedStatuses.clear(); }
  private persist() {
    this.syncPreferences();
    try { this.storage?.setItem(this.storageKey, JSON.stringify({ version: 1, seen: this.preferences.seen.slice(-200), dismissed: this.preferences.dismissed.slice(-200), activity: this.preferences.activity })); }
    catch { this.set({ persistenceError: "Notification preferences could not be saved. Dismissed popups may reappear after reloading." }); }
  }
  syncPreferences = () => {
    try {
      const saved = parsePaperNoticePreferences(this.storage?.getItem(this.storageKey) ?? null);
      const seen = new Map([...saved.seen, ...this.preferences.seen].map(n => [key(n.id, n.kind), n]));
      this.preferences = { seen: [...seen.values()].slice(-200), dismissed: [...new Set([...saved.dismissed, ...this.preferences.dismissed])].slice(-200), activity: {
        tracked: [...new Set([...saved.activity.tracked, ...this.preferences.activity.tracked])].slice(-200),
        dismissed: [...new Set([...saved.activity.dismissed, ...this.preferences.activity.dismissed])].slice(-200),
      } };
      this.set({ notices: this.state.notices.filter(n => !this.preferences.dismissed.includes(key(n.id, n.kind))), activity: this.state.activity.filter(n => !this.preferences.activity.dismissed.includes(activityKey(n.id, n.phase))) });
    } catch { this.set({ persistenceError: "Notification preferences are unavailable. Dismissed popups may reappear after reloading." }); }
  };
  private notice(id: string, title: string, kind: Kind) {
    if (!this.preferences.seen.some(n => n.id === id && n.kind === kind)) this.preferences.seen.push({ id, kind });
    if (this.preferences.dismissed.includes(key(id, kind))) return;
    if (!this.state.notices.some(n => n.id === id && n.kind === kind)) this.set({ notices: [...this.state.notices, { id, title, kind }] });
  }
  dismiss = (id: string, kind: Kind) => {
    this.preferences.dismissed = [...new Set([...this.preferences.dismissed, key(id, kind)])].slice(-200);
    this.set({ notices: this.state.notices.filter(n => n.id !== id || n.kind !== kind) }); this.persist();
  };
  dismissActivity = (id: string, phase: AssessmentActivity["phase"]) => {
    this.preferences.activity.dismissed = [...new Set([...this.preferences.activity.dismissed, activityKey(id, phase)])].slice(-200);
    this.set({ activity: this.state.activity.filter(n => n.id !== id || n.phase !== phase) }); this.persist();
  };
  trackAssessment = (id: string, title: string) => {
    if (!this.active || !this.ownerId || !ID.test(id)) return;
    this.finishedStatuses.delete(id);
    this.preferences.activity.tracked = [...new Set([...this.preferences.activity.tracked, id])].slice(-200);
    if (!this.state.activity.some(n => n.id === id)) this.set({ activity: [...this.state.activity, { id, title, phase: "assessing", status: "submitted", counts: null }] });
    this.dismiss(id, "ready"); void this.refresh();
  };
  private updateActivity(studies: Study[]) {
    const activity: AssessmentActivity[] = [];
    for (const study of studies) {
      const submitted = this.state.activity.find(item => item.id === study.id && item.status === "submitted");
      // A listing already in flight can describe the review before the owner's
      // confirmed response. Do not roll its queued notice back to preparation.
      if (submitted && (study.paper_review_status === "preparing" || study.paper_review_status === "ready")) { activity.push(submitted); continue; }
      const summary = study.assessment_status;
      const preparing = study.paper_review_status === "preparing";
      const eligible = study.paper_review_status === "confirmed" || study.paper_review_status === undefined;
      if (preparing || eligible && summary?.status === "running") this.preferences.activity.tracked = [...new Set([...this.preferences.activity.tracked, study.id])].slice(-200);
      if (!this.preferences.activity.tracked.includes(study.id)) continue;
      if (!preparing && !eligible) continue;
      const previous = this.state.activity.find(item => item.id === study.id);
      if (study.assessment_status_error && previous) { activity.push({ ...previous, statusError: study.assessment_status_error }); continue; }
      const phase = summary && summary.status !== "running" ? "finished" : preparing ? "preparing" : "assessing";
      if (this.preferences.activity.dismissed.includes(activityKey(study.id, phase))) continue;
      activity.push({ id: study.id, title: study.title, phase, status: phase === "preparing" ? "preparing" : summary?.status ?? "unavailable", counts: phase === "preparing" ? null : summary?.counts ?? null, ...(study.assessment_status_error ? { statusError: study.assessment_status_error } : {}) });
    }
    // A confirmed response can precede its appearance in the listing. Preserve
    // that submitted notice until the next recorded status, without inventing counts.
    for (const item of this.state.activity) if (!studies.some(s => s.id === item.id) && item.status === "submitted") activity.push(item);
    this.set({ activity });
  }
  private async legacyStatuses(studies: Study[], generation: number) {
    // Older deployments ignore status=1. Read the existing public projection,
    // never private prompts, and never treat absent/partial records as zero.
    const ids = new Set(studies.map(study => study.id));
    for (const id of this.finishedStatuses.keys()) if (!ids.has(id)) this.finishedStatuses.delete(id);
    const pending = studies.filter(study => study.assessment_status == null && study.paper_review_status === "confirmed");
    let index = 0;
    const worker = async () => {
      while (this.active && generation === this.generation && index < pending.length) {
        const study = pending[index++];
        const cached = this.finishedStatuses.get(study.id);
        if (cached && Date.now() - cached.readAt < FINISHED_STATUS_CACHE_MS) { study.assessment_status = cached.summary; continue; }
        try {
          const queue = await this.readQueue(study.id, this.lifecycle.signal);
          if (!this.active || generation !== this.generation) return;
          study.assessment_status = assessmentSummaryFromPublicQueue(queue, study.id);
          if (study.assessment_status && study.assessment_status.status !== "running") this.finishedStatuses.set(study.id, { summary: study.assessment_status, readAt: Date.now() });
          else this.finishedStatuses.delete(study.id);
        } catch (error) {
          if (!this.active || generation !== this.generation) return;
          study.assessment_status_error = error instanceof Error ? error.message : "Queue status could not be retrieved. It will be retried automatically.";
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PAPER_STATUS_PARALLELISM, pending.length) }, worker));
  }
  refresh = async () => {
    if (!this.active || !this.ownerId) return;
    if (this.pollingGeneration === this.generation) { this.refreshAgain = true; return; }
    clearTimeout(this.timer); const generation = this.generation; this.pollingGeneration = generation;
    try {
      const listing = await this.request<OwnerStudyList>("/studies?mine=1&status=1", { signal: this.lifecycle.signal });
      const studies = ownerStudies(listing);
      if (!this.active || generation !== this.generation) return;
      if (listing.assessment_status_version === undefined && studies.some(study => study.assessment_status == null && study.paper_review_status === "confirmed")) await this.legacyStatuses(studies, generation);
      if (!this.active || generation !== this.generation) return;
      const uploads = this.state.uploads.map(u => {
        const study = studies.find(s => s.id === u.id);
        return study && !["queued", "uploading"].includes(u.phase) ? { ...u, title: study.title, phase: study.paper_review_status!, message: "", retryable: false } : u;
      });
      this.set({ uploads, error: "" });
      this.updateActivity(studies);
      for (const study of studies) {
        if (study.paper_review_status === "ready" || study.paper_review_status === "failed") this.notice(study.id, study.title, study.paper_review_status);
        // A notice stays until closed, including after the owner starts the assessment.
        for (const seen of this.preferences.seen.filter(n => n.id === study.id)) this.notice(study.id, study.title, seen.kind);
      }
      this.set({ notices: this.state.notices.map(n => ({ ...n, title: studies.find(s => s.id === n.id)?.title ?? n.title })) });
      this.persist();
    } catch (error) {
      if (this.active && generation === this.generation) this.set({ error: error instanceof Error ? error.message : "Paper status is unavailable." });
    } finally {
      if (this.pollingGeneration === generation) this.pollingGeneration = null;
      if (this.active && generation === this.generation) {
        const delay = this.refreshAgain ? 0 : PAPER_STATUS_POLL_MS; this.refreshAgain = false;
        this.timer = setTimeout(() => { void this.refresh(); }, delay);
      }
    }
  };
  enqueue = (files: File[]) => {
    if (!this.active || !this.ownerId) throw new Error("Check your sign-in before uploading a paper.");
    if (!files.length || files.length > 20 || this.state.uploads.length + files.length > 100) throw new Error("Select up to 20 PDFs at a time, with at most 100 uploads in this browser session.");
    const items = files.map(file => {
      const id = crypto.randomUUID(); this.files.set(id, file);
      return { id, filename: file.name, title: file.name, phase: "queued" as const, message: "Waiting to upload…", retryable: false };
    });
    this.set({ uploads: [...this.state.uploads, ...items] }); this.pump();
  };
  retry = (id: string) => {
    if (!this.active || !this.files.has(id) || !this.state.uploads.some(u => u.id === id && u.retryable)) return;
    this.patch(id, { phase: "queued", message: "Waiting to retry…", retryable: false }); this.pump();
  };
  hasTransfers = () => this.state.uploads.some(u => u.phase === "queued" || u.phase === "uploading");
  private pump() {
    while (this.active && this.pending < PAPER_UPLOAD_PARALLELISM) {
      const item = this.state.uploads.find(u => u.phase === "queued");
      if (!item) break;
      this.pending++; this.patch(item.id, { phase: "uploading" }); void this.send(item);
    }
  }
  private async send(item: PaperUploadItem) {
    const generation = this.generation, signal = this.lifecycle.signal;
    try {
      const file = this.files.get(item.id)!;
      const request: Request = (path, options) => { signal.throwIfAborted(); return this.request(path, { ...options, signal }); };
      const result = await prepareUploadedPaper(request, item.id, file, async (ticket, original) => {
        signal.throwIfAborted(); await this.upload(ticket, original);
      }, message => { if (this.active && generation === this.generation) this.patch(item.id, { message }); });
      if (!this.active || generation !== this.generation) return;
      this.files.delete(item.id);
      this.patch(item.id, { phase: result.status as Phase, message: "Paper preparation continues in the background.", retryable: false });
      void this.refresh();
    } catch (error) {
      if (this.active && generation === this.generation) {
        const message = error instanceof Error ? error.message : "The upload could not be confirmed.";
        this.patch(item.id, { phase: "failed", message, retryable: true }); this.notice(item.id, item.title, "failed"); this.persist();
      }
    } finally { this.pending--; if (this.active && generation === this.generation) this.pump(); }
  }
}
