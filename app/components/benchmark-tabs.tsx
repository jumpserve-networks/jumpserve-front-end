"use client";

import { useState } from "react";
import { BenchmarkForm } from "./benchmark-form";
import { BenchmarkStatus } from "./benchmark-status";

const TABS = [
  { key: "configure", label: "Configure" },
  { key: "history", label: "Run History" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function BenchmarkTabs({ userEmail }: { userEmail?: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>("configure");

  return (
    <div>
      {/* Tab bar */}
      <div className="mt-6 flex border-b border-slate-200 dark:border-slate-700">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-rose-500 text-rose-600 dark:text-rose-400"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "configure" && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <BenchmarkForm userEmail={userEmail} />
          </div>
        )}

        {activeTab === "history" && <BenchmarkStatus />}
      </div>
    </div>
  );
}
