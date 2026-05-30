"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  applyTheme,
  getServerThemePreferenceSnapshot,
  getThemePreferenceSnapshot,
  setThemePreference,
  subscribeToThemePreference,
  type ThemePreference,
} from "@/lib/theme-preference";

const THEME_OPTIONS: Array<{
  id: ThemePreference;
  label: string;
}> = [
  {
    id: "light",
    label: "light",
  },
  {
    id: "system",
    label: "default",
  },
  {
    id: "dark",
    label: "dark",
  },
];
const LANDING_SERIF_FONT = "Georgia, 'Times New Roman', serif";

function LightThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-20 w-20 sm:h-28 sm:w-28">
      <path
        d="M12 4.5v-2M12 21.5v-2M4.5 12h-2M21.5 12h-2M6.22 6.22l-1.42-1.42M19.2 19.2l-1.42-1.42M17.78 6.22l1.42-1.42M6.8 19.2l1.42-1.42"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </svg>
  );
}

function SystemThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-20 w-20 sm:h-28 sm:w-28">
      <defs>
        <linearGradient
          id="system-theme-icon-split"
          x1="22"
          y1="22"
          x2="2"
          y2="2"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      <rect
        x="3"
        y="4"
        width="18"
        height="13"
        rx="2"
        fill="none"
        stroke="url(#system-theme-icon-split)"
        strokeWidth="1.6"
      />
      <path
        d="M8 20h8M10.5 17h3"
        stroke="url(#system-theme-icon-split)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DarkThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-20 w-20 sm:h-28 sm:w-28">
      <path
        d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === "light") {
    return <LightThemeIcon />;
  }

  if (preference === "dark") {
    return <DarkThemeIcon />;
  }

  return <SystemThemeIcon />;
}

function getThemeOptionCircleClassName(preference: ThemePreference) {
  if (preference === "dark") {
    return "flex h-36 w-36 items-center justify-center rounded-full border border-slate-700/80 bg-slate-950 text-white shadow-lg shadow-black/30 backdrop-blur transition hover:scale-[1.03] sm:h-48 sm:w-48";
  }

  if (preference === "system") {
    return "flex h-36 w-36 items-center justify-center rounded-full text-zinc-900 shadow-lg shadow-zinc-900/10 backdrop-blur transition hover:scale-[1.03] sm:h-48 sm:w-48";
  }

  return "flex h-36 w-36 items-center justify-center rounded-full border border-zinc-200/70 bg-white text-zinc-700 shadow-lg shadow-zinc-900/10 backdrop-blur transition hover:scale-[1.03] sm:h-48 sm:w-48";
}

function getThemeOptionCircleStyle(preference: ThemePreference) {
  if (preference === "system") {
    return {
      background:
        "linear-gradient(135deg, #ffffff 0%, #ffffff 50%, #0f172a 50%, #0f172a 100%)",
    };
  }

  return undefined;
}

function InfoModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sectionTitle = "mb-2 text-base font-bold text-slate-800 dark:text-slate-100";
  const prose = "text-sm leading-relaxed text-slate-600 dark:text-slate-300";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div
        ref={ref}
        className="relative mx-4 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 sm:p-8"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="mb-6 text-xl font-bold text-slate-900 dark:text-slate-50">
          How to use JumpServe
        </h2>

        <div className="space-y-5">
          <section>
            <h3 className={sectionTitle}>Test Lookup</h3>
            <p className={prose}>
              Browse and search individual benchmark runs. Each run shows per-client throughput,
              RTT, queueing delay, and congestion window over time. Click any run to see detailed
              charts and snapshot-level data.
            </p>
          </section>

          <section>
            <h3 className={sectionTitle}>Aggregate Graphs</h3>
            <p className={prose}>
              Compare metrics across groups of runs. Select multiple parent runs to overlay
              throughput or RTT curves and spot trends across different configurations.
            </p>
          </section>

          <section>
            <h3 className={sectionTitle}>Run Benchmark</h3>
            <p className={prose}>
              Launch TCP congestion control benchmarks on fresh EC2 instances. Configure the number
              of clients, CCA per client (CUBIC, BBR, etc.), per-client delays, bottleneck rate, and
              buffer size. Each run spins up a new instance, runs the experiment, persists results to
              the database, and tears down the instance.
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300 space-y-1">
              <li><strong>Saved configs</strong> — save and reload frequently used configurations</li>
              <li><strong>Experiment tags</strong> — tag runs for easy search (e.g. &quot;paper-fig3&quot;, &quot;fairness&quot;)</li>
              <li><strong>Multi-bottleneck</strong> — select the Multi-Bottleneck script for parking-lot or dumbbell topologies</li>
            </ul>
          </section>

          <section>
            <h3 className={sectionTitle}>Chat with AI</h3>
            <p className={prose}>
              An AI assistant powered by Claude that can run benchmarks, query results, compute
              fairness metrics, and explain congestion control behavior — all in natural language.
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300 space-y-1">
              <li>&quot;Run a 2-client cubic vs bbr test at 100 Mbit with 10ms and 60ms delays&quot;</li>
              <li>&quot;Show results for my last run&quot;</li>
              <li>&quot;Compare run 42 and run 43&quot;</li>
              <li>&quot;Find all runs tagged fairness&quot;</li>
              <li>&quot;What&apos;s the Jain&apos;s fairness index for run 50?&quot;</li>
            </ul>
          </section>

          <section>
            <h3 className={sectionTitle}>Key Concepts</h3>
            <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300 space-y-1">
              <li><strong>CCA</strong> — Congestion Control Algorithm (CUBIC, BBR, Reno, etc.)</li>
              <li><strong>Parent Run</strong> — a single benchmark execution containing all clients</li>
              <li><strong>Bottleneck</strong> — the shared link all clients compete over</li>
              <li><strong>Jain&apos;s Fairness Index</strong> — 1.0 = perfectly fair, 1/n = maximally unfair</li>
              <li><strong>FCT</strong> — Flow Completion Time, how long each client takes to finish</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

type LandingPageShellProps = {
  initialHasStoredThemePreference?: boolean;
};

export function LandingPageShell({
  initialHasStoredThemePreference = false,
}: LandingPageShellProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [isThemeChooserOpen, setIsThemeChooserOpen] = useState(
    !initialHasStoredThemePreference,
  );
  const [previewPreference, setPreviewPreference] = useState<ThemePreference | null>(null);
  const storedPreferenceRef = useRef<ThemePreference>("system");
  const themeSnapshot = useSyncExternalStore(
    subscribeToThemePreference,
    getThemePreferenceSnapshot,
    getServerThemePreferenceSnapshot,
  );
  const activePreference = previewPreference ?? themeSnapshot.preference;
  const isThemeChooserVisible =
    isThemeChooserOpen && !themeSnapshot.hasStoredPreference;

  useEffect(() => {
    applyTheme(activePreference);
  }, [activePreference]);

  useEffect(() => {
    storedPreferenceRef.current = themeSnapshot.preference;
  }, [themeSnapshot.preference]);

  useEffect(() => {
    return () => {
      applyTheme(storedPreferenceRef.current);
    };
  }, []);

  function handleThemeSelect(preference: ThemePreference) {
    setThemePreference(preference);
    setPreviewPreference(null);
    setIsThemeChooserOpen(false);
  }

  function handlePreviewStart(preference: ThemePreference) {
    setPreviewPreference(preference);
  }

  function handlePreviewEnd() {
    setPreviewPreference(null);
  }

  return (
    <>
    <main
      className="space-atmosphere relative min-h-screen overflow-hidden"
      style={{ fontFamily: LANDING_SERIF_FONT }}
    >
      {isThemeChooserVisible ? (
        <section className="absolute inset-0 z-[60]">
          <div className="absolute inset-0 bg-white/25 backdrop-blur-sm dark:bg-slate-950/35" />
          <div className="relative z-10 flex min-h-screen flex-col justify-center px-4 py-6 sm:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <p
                className="chooser-fade-up-late mt-24 -translate-y-16 text-center text-sm font-semibold uppercase tracking-[0.36em] text-slate-600 dark:text-slate-300 sm:mt-32 sm:-translate-y-20"
                style={{ fontFamily: LANDING_SERIF_FONT }}
              >
                Jumpserve
              </p>
              <div className="-mt-10 grid min-h-[44vh] grid-cols-3 gap-6 sm:-mt-14 sm:gap-10">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleThemeSelect(option.id)}
                    aria-label={`Set theme to ${option.id}`}
                    className="chooser-fade-up flex h-full min-h-[18rem] flex-col items-center justify-center gap-6 text-slate-800 transition hover:-translate-y-1 dark:text-slate-100"
                  >
                    <span
                      className={getThemeOptionCircleClassName(option.id)}
                      style={getThemeOptionCircleStyle(option.id)}
                      onMouseEnter={() => handlePreviewStart(option.id)}
                      onMouseLeave={handlePreviewEnd}
                      onFocus={() => handlePreviewStart(option.id)}
                      onBlur={handlePreviewEnd}
                    >
                      <ThemeIcon preference={option.id} />
                    </span>
                    <span
                      className="text-3xl font-semibold tracking-[0.08em] sm:text-4xl"
                      style={{ fontFamily: LANDING_SERIF_FONT }}
                    >
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-8 sm:px-10">
        <div className="w-full max-w-xl">
          <p className="mb-4 text-center text-2xl font-semibold tracking-[0.08em] text-slate-900 dark:text-slate-100">
            <span
              className="chooser-fade-up-late inline-block"
              style={{ fontFamily: LANDING_SERIF_FONT }}
            >
              Jumpserve
            </span>
          </p>
          <nav className="chooser-fade-up grid grid-cols-1 gap-3 rounded-[1.75rem] border border-rose-200/70 bg-[#fff8fc]/95 p-4 text-center shadow-xl dark:border-slate-600 dark:bg-slate-800/82 sm:grid-cols-2">
            <Link
              href="/test-lookup"
              className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-[1.2rem] bg-slate-900 px-4 py-4 text-center text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            >
              <span className="text-lg font-semibold">Test lookup</span>
              <span className="text-sm font-normal leading-5 opacity-80">
                Search individual tests and inspect their run details
              </span>
            </Link>
            <Link
              href="/aggregate-graphs"
              className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-[1.2rem] border border-rose-300/80 bg-[#fff5fb] px-4 py-4 text-center text-slate-800 transition hover:-translate-y-0.5 hover:border-rose-400 hover:bg-rose-50 dark:border-slate-500 dark:bg-slate-700/85 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700"
            >
              <span className="text-lg font-semibold">Aggregate graphs</span>
              <span className="text-sm font-normal leading-5 opacity-75">
                Compare emulation metrics across groups of runs
              </span>
            </Link>
            <Link
              href="/benchmarks"
              className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-[1.2rem] border border-rose-300/80 bg-[#fff5fb] px-4 py-4 text-center text-slate-800 transition hover:-translate-y-0.5 hover:border-rose-400 hover:bg-rose-50 dark:border-slate-500 dark:bg-slate-700/85 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700"
            >
              <span className="text-lg font-semibold">Run benchmark</span>
              <span className="text-sm font-normal leading-5 opacity-75">
                Configure and launch benchmarks on fresh EC2 instances
              </span>
            </Link>
            <Link
              href="/chat"
              className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-[1.2rem] bg-slate-900 px-4 py-4 text-center text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            >
              <span className="text-lg font-semibold">Chat with AI</span>
              <span className="text-sm font-normal leading-5 opacity-80">
                Run tests and analyze results in natural language
              </span>
            </Link>
          </nav>
        </div>
      </div>
    </main>

    {/* TODO: Re-add info button once positioning is resolved */}
    {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </>
  );
}
