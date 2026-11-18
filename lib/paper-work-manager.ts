import { paperWorkActivities, validatePaperWorkListing, workGroup, workKey, workNoticeKey, workPending, type PaperWorkActivity, type PaperWorkListing, type PaperWorkUnit } from "./paper-work-status";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type Preferences = { watched: string[]; dismissed: string[] };
type State = { activity: PaperWorkActivity[]; error: string; persistenceError: string };
type Metadata = Pick<PaperWorkUnit, "id" | "title" | "step"> & { index?: number; total?: number; resume?: boolean };
const EMPTY: State = { activity: [], error: "", persistenceError: "" };
const GROUP = /^[a-f0-9-]{36}:[34]$/i, NOTICE = /^[a-f0-9-]{36}:[34]:(working|not_generated|uncertain|ready|failed|cancelled)$/i;
function preferences(raw: string | null): Preferences {
  if (!raw) return { watched: [], dismissed: [] };
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.watched) || value.watched.length > 200 || !value.watched.every((v: unknown) => typeof v === "string" && GROUP.test(v)) || !Array.isArray(value.dismissed) || value.dismissed.length > 600 || !value.dismissed.every((v: unknown) => typeof v === "string" && NOTICE.test(v))) throw new Error("Saved background notification preferences are invalid.");
  return value;
}
/** App-wide ownership keeps submissions alive across page unmounts. Polling only reconciles saved calls. */
export class PaperWorkManager {
  private state = EMPTY;
  private listeners = new Set<() => void>();
  private units = new Map<string, PaperWorkUnit>();
  private versions = new Map<string, number>();
  private inFlight = new Map<string, Promise<unknown>>();
  private continuations = new Map<string, () => void>();
  private prefs: Preferences = { watched: [], dismissed: [] };
  private storage?: Storage;
  private active = false;
  private generation = 0;
  private lifecycle = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private refreshing: number | null = null;
  private cursor = 0;
  readonly storageKey: string;
  readonly ownerId: string | null;
  private readStatus: (cursor: number, signal: AbortSignal) => Promise<PaperWorkListing>;
  constructor(ownerId: string | null, readStatus: (cursor: number, signal: AbortSignal) => Promise<PaperWorkListing>) { this.ownerId = ownerId;this.readStatus = readStatus;this.storageKey = `jumpserve.paper-work.v1.${ownerId}`; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  getServerSnapshot = () => EMPTY;
  private emit(patch: Partial<State> = {}) {
    this.state = { ...this.state, ...patch, activity: paperWorkActivities([...this.units.values()].filter(u => this.prefs.watched.includes(workGroup(u)))).filter(a => !this.prefs.dismissed.includes(workNoticeKey(a))) };
    this.listeners.forEach(listener => listener());
  }
  start(storage?: Storage) {
    this.active = Boolean(this.ownerId); this.storage = storage; this.lifecycle = new AbortController();
    this.syncPreferences();
    if (this.active) { this.persist();void this.refresh(); }
  }
  stop() { this.active = false; this.generation++; this.lifecycle.abort(); clearTimeout(this.timer); this.inFlight.clear(); this.continuations.clear(); this.units.clear(); this.versions.clear(); this.state = EMPTY; }
  syncPreferences = () => {
    try { const saved = preferences(this.storage?.getItem(this.storageKey) ?? null); this.prefs = { watched: [...new Set([...saved.watched, ...this.prefs.watched])].slice(-200), dismissed: [...new Set([...saved.dismissed, ...this.prefs.dismissed])].slice(-600) }; this.emit(); }
    catch { this.emit({ persistenceError: "Background notification preferences could not be restored." }); }
  };
  private persist() {
    try {
      if (!this.storage) return;
      const saved = preferences(this.storage.getItem(this.storageKey));
      this.prefs = { watched: [...new Set([...saved.watched, ...this.prefs.watched])].slice(-200), dismissed: [...new Set([...saved.dismissed, ...this.prefs.dismissed])].slice(-600) };
      this.storage.setItem(this.storageKey, JSON.stringify({ version: 1, ...this.prefs }));
    }
    catch { this.emit({ persistenceError: "Background notification preferences could not be saved." }); }
  }
  dismiss = (activity: PaperWorkActivity) => { this.prefs.dismissed = [...new Set([...this.prefs.dismissed, workNoticeKey(activity)])].slice(-600); this.persist(); this.emit(); };
  hasSubmissions = () => this.inFlight.size > 0 || this.continuations.size > 0;
  private observe(unit: PaperWorkUnit) { const key = workKey(unit); this.units.set(key, unit); this.versions.set(key, (this.versions.get(key) ?? 0) + 1); this.emit(); }
  perform = <T extends { stage: string; reason?: string | null; prior_pending?: number }>(metadata: Metadata, operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const unit: PaperWorkUnit = { ...metadata, index: metadata.index ?? 1, total: metadata.total ?? 1, stage: "submitting", reason: null, updated_at: null };
    const key = workKey(unit), existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;
    if (!this.ownerId || !GROUP.test(workGroup(unit))) return Promise.reject(new Error("Sign in to start background paper work."));
    this.prefs.watched = [...new Set([...this.prefs.watched, workGroup(unit)])].slice(-200); this.persist();
    // Preserve completed units while a read checks their immutable saved result.
    if (!this.units.has(key)) this.observe(unit);
    const generation = this.generation;
    const task = Promise.resolve().then(async () => {
      if (!this.active || generation !== this.generation) throw new Error("The signed-in paper session changed.");
      const result = await operation(this.lifecycle.signal);
      if (this.active && generation === this.generation) {
        if (metadata.resume && result.stage === "not_generated" && result.prior_pending && result.prior_pending > 0) this.continuations.set(key, () => { void this.perform(metadata, operation).catch(() => {}); });
        else this.continuations.delete(key);
        const stage = ["not_generated", "submitting", "processing", "uncertain", "ready", "failed", "cancelled"].includes(result.stage) ? result.stage as PaperWorkUnit["stage"] : "not_generated";
        this.observe({ ...unit, stage, reason: result.reason ?? null }); this.persist(); void this.refresh();
      }
      return result;
    }).catch(error => {
      if (this.active && generation === this.generation) { this.continuations.delete(key);this.observe({ ...unit, stage: "uncertain", status_error: (error instanceof Error ? error.message : "The saved request could not be checked.").slice(0, 2000) }); }
      throw error;
    }).finally(() => { if (this.inFlight.get(key) === task) this.inFlight.delete(key); });
    this.inFlight.set(key, task); return task;
  };
  refresh = async () => {
    if (!this.active || !this.ownerId || this.refreshing === this.generation) return;
    const generation = this.generation, versions = new Map(this.versions); this.refreshing = generation; clearTimeout(this.timer);
    try {
      const listing = validatePaperWorkListing(await this.readStatus(this.cursor, this.lifecycle.signal));
      if (!this.active || generation !== this.generation) return;
      this.cursor = listing.next_cursor;
      for (const unit of listing.units) {
        const key = workKey(unit), previous = this.units.get(key);
        if (this.inFlight.has(key) || (versions.get(key) ?? 0) !== (this.versions.get(key) ?? 0)) continue;
        if (workPending(unit.stage) || unit.stage === "uncertain") this.prefs.watched = [...new Set([...this.prefs.watched, workGroup(unit)])].slice(-200);
        if (previous && ["ready", "failed", "cancelled"].includes(previous.stage) && workPending(unit.stage)) continue;
        this.units.set(key, unit);
      }
      for (const [key, unit] of this.units) if (!listing.study_ids.includes(unit.id) && !this.inFlight.has(key) && versions.get(key) === this.versions.get(key)) this.units.delete(key);
      this.emit({ error: "" }); this.persist();
      for (const resume of [...this.continuations.values()].slice(0, 2)) resume();
    } catch (error) { if (this.active && generation === this.generation) this.emit({ error: error instanceof Error ? error.message : "Background paper status is unavailable." }); }
    finally { if (this.refreshing === generation) this.refreshing = null; if (this.active && generation === this.generation) this.timer = setTimeout(() => void this.refresh(), 10000); }
  };
}
