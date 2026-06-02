"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, type AgentResponse } from "@/lib/agent-api";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolEvents?: Array<{ name: string; input: any }>;
}

interface SessionSummary {
  id: string;
  updated_at: string;
  preview: string;
}

function ToolEventBadge({ name }: { name: string }) {
  const labels: Record<string, string> = {
    run_benchmark: "Launched benchmark",
    cancel_benchmark: "Cancelled benchmark",
    list_jobs: "Listed jobs",
    get_job_status: "Checked job status",
    get_run_results: "Fetched results",
    compare_runs: "Compared runs",
    search_runs: "Searched runs",
    list_configs: "Listed configs",
    save_config: "Saved config",
    delete_config: "Deleted config",
    run_saved_config: "Loaded config",
    get_benchmark_logs: "Fetched logs",
  };

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
      </svg>
      {labels[name] || name}
    </span>
  );
}

/**
 * Parse Strands-format messages into UI messages.
 *
 * Strands stores messages with content blocks using top-level keys:
 *   - {text: "..."} for text content
 *   - {toolUse: {toolUseId, name, input}} for tool calls
 *   - {toolResult: {...}} for tool results (under role=user)
 *
 * A typical tool-use flow is:
 *   user [{text}] → assistant [{toolUse}] → user [{toolResult}] → assistant [{text}]
 *
 * We merge consecutive assistant messages so tool badges appear with the final text.
 */
function parseSavedMessages(raw: any[]): Message[] {
  const msgs: Message[] = [];
  let pendingToolEvents: Array<{ name: string; input: any }> = [];

  for (const m of raw) {
    if (!m.role || !m.content) continue;
    const blocks = Array.isArray(m.content) ? m.content : [m.content];

    if (m.role === "user") {
      // Check if this is a toolResult message (skip it)
      const hasToolResult = blocks.some(
        (b: any) => typeof b === "object" && b.toolResult,
      );
      if (hasToolResult) continue;

      // Regular user message
      const text = blocks
        .map((b: any) => {
          if (typeof b === "string") return b;
          if (b.text) return b.text;
          return "";
        })
        .join("");
      if (text) msgs.push({ role: "user", content: text });
    } else if (m.role === "assistant") {
      let text = "";
      const toolEvents: Array<{ name: string; input: any }> = [];

      for (const block of blocks) {
        if (typeof block === "string") {
          text += block;
        } else if (block.text) {
          text += block.text;
        } else if (block.toolUse) {
          toolEvents.push({
            name: block.toolUse.name,
            input: block.toolUse.input,
          });
        }
        // Also handle the {"type": "text"/"tool_use"} format as fallback
        else if (block.type === "text" && block.text) {
          text += block.text;
        } else if (block.type === "tool_use") {
          toolEvents.push({ name: block.name, input: block.input });
        }
      }

      if (toolEvents.length > 0 && !text) {
        // Tool-use-only message — save events to merge with next assistant text
        pendingToolEvents.push(...toolEvents);
      } else if (text) {
        const allToolEvents = [...pendingToolEvents, ...toolEvents];
        pendingToolEvents = [];
        msgs.push({
          role: "assistant",
          content: text,
          toolEvents: allToolEvents.length > 0 ? allToolEvents : undefined,
        });
      }
    }
  }

  return msgs;
}

function extractPreview(messages: any[]): string {
  if (!Array.isArray(messages)) return "Empty chat";
  const firstUser = messages.find(
    (m: any) =>
      m.role === "user" &&
      Array.isArray(m.content) &&
      !m.content.some((b: any) => b.toolResult),
  );
  if (!firstUser) return "Empty chat";
  const blocks = Array.isArray(firstUser.content) ? firstUser.content : [firstUser.content];
  const text = blocks
    .map((b: any) => (typeof b === "string" ? b : b.text || ""))
    .join("");
  return text.slice(0, 50) + (text.length > 50 ? "..." : "");
}

// ── Sidebar ─────────────────────────────────────────────

function SessionSidebar({
  sessions,
  activeSessionId,
  onNewSession,
  onSwitchSession,
  onDeleteSession,
  sidebarOpen,
  onToggleSidebar,
}: {
  sessions: SessionSummary[];
  activeSessionId: string;
  onNewSession: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <div
      className={`flex flex-col border-r border-slate-200 bg-white transition-all dark:border-slate-700 dark:bg-slate-900 ${
        sidebarOpen ? "w-64" : "w-0 overflow-hidden border-r-0"
      }`}
    >
      <div className="flex items-center justify-between px-3 py-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Chats
        </h3>
        <button
          onClick={onToggleSidebar}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
      </div>

      <button
        onClick={onNewSession}
        className="mx-3 mb-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 transition hover:border-rose-400 hover:text-rose-500 dark:border-slate-600 dark:text-slate-400"
      >
        + New Chat
      </button>

      <div className="flex-1 overflow-y-auto px-2">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`group mb-1 flex items-start gap-1 rounded-lg px-2.5 py-2 text-sm transition ${
              s.id === activeSessionId
                ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            <button
              onClick={() => onSwitchSession(s.id)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-xs font-medium">{s.preview}</p>
              <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                {new Date(s.updated_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(s.id);
              }}
              className="mt-0.5 shrink-0 rounded p-1 text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100 dark:text-slate-600 dark:hover:text-red-400"
              title="Delete chat"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ChatPanel ──────────────────────────────────────

export function ChatPanel({ userEmail }: { userEmail?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [supabase] = useState(() => createClient());
  const [sessionId, setSessionId] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("jumpserve-chat-session");
      if (stored) return stored;
      const id = crypto.randomUUID();
      localStorage.setItem("jumpserve-chat-session", id);
      return id;
    }
    return crypto.randomUUID();
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    const { data } = await supabase
      .from("agent_sessions")
      .select("id, updated_at, messages")
      .order("updated_at", { ascending: false })
      .limit(30);
    if (data) {
      setSessions(
        data.map((s: any) => ({
          id: s.id,
          updated_at: s.updated_at,
          preview: extractPreview(s.messages),
        })),
      );
    }
  }, [supabase]);

  // Load current session history + session list on mount
  useEffect(() => {
    async function loadHistory() {
      const { data } = await supabase
        .from("agent_sessions")
        .select("messages")
        .eq("id", sessionId)
        .single();
      if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages(parseSavedMessages(data.messages));
      }
      setHistoryLoaded(true);
    }
    loadHistory();
    loadSessions();
  }, [sessionId, supabase, loadSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsLoading(true);

    try {
      const result: AgentResponse = await sendMessage(text, sessionId, userEmail);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.response, toolEvents: result.tool_events },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err.message}` },
      ]);
    } finally {
      setIsLoading(false);
      loadSessions(); // refresh sidebar after new message
    }
  }

  function handleNewSession() {
    const id = crypto.randomUUID();
    localStorage.setItem("jumpserve-chat-session", id);
    setSessionId(id);
    setMessages([]);
    setHistoryLoaded(true);
  }

  function switchSession(id: string) {
    localStorage.setItem("jumpserve-chat-session", id);
    setSessionId(id);
    setMessages([]);
    setHistoryLoaded(false);
  }

  async function deleteSession(id: string) {
    await supabase.from("agent_sessions").delete().eq("id", id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === sessionId) {
      handleNewSession();
    }
  }

  const mdClasses =
    "text-sm [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-200/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1 dark:[&_th]:border-slate-600 dark:[&_th]:bg-slate-700/50 dark:[&_td]:border-slate-600 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_p]:my-1 [&_pre]:bg-slate-800 [&_pre]:text-slate-200 [&_pre]:rounded [&_pre]:p-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_code]:text-rose-500 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:my-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:my-2 [&_h3]:font-bold [&_h3]:my-1";

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
      {/* Sidebar */}
      <SessionSidebar
        sessions={sessions}
        activeSessionId={sessionId}
        onNewSession={handleNewSession}
        onSwitchSession={switchSession}
        onDeleteSession={deleteSession}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(false)}
      />

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 p-4">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="mb-2 rounded-lg border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              title="Show chat history"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )}

          {messages.length === 0 && historyLoaded && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-lg font-medium text-slate-400 dark:text-slate-500">
                  Ask me anything about your benchmarks
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {[
                    "Run a cubic vs bbr test at 100 Mbit",
                    "Show my recent jobs",
                    "What CCAs are available?",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setInput(suggestion)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-rose-500 dark:hover:text-rose-400"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-rose-500 text-white"
                    : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                {msg.toolEvents && msg.toolEvents.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {msg.toolEvents.map((te, j) => (
                      <ToolEventBadge key={j} name={te.name} />
                    ))}
                  </div>
                )}
                {msg.role === "user" ? (
                  <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                ) : (
                  <div className={mdClasses}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0.1s" }} />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0.2s" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about benchmarks, results, or congestion control..."
              disabled={isLoading}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 transition focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/30 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-rose-400"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="shrink-0 rounded-lg bg-rose-500 p-2.5 text-white transition hover:bg-rose-600 disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
