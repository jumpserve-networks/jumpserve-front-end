"use client";

import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, type AgentResponse } from "@/lib/agent-api";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolEvents?: Array<{ name: string; input: unknown }>;
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textFromBlock(block: unknown): string {
  if (typeof block === "string") return block;
  return isRecord(block) && typeof block.text === "string" ? block.text : "";
}

function parseSavedMessages(raw: unknown[]): Message[] {
  const msgs: Message[] = [];
  let pendingToolEvents: Array<{ name: string; input: unknown }> = [];

  for (const m of raw) {
    if (!isRecord(m) || !m.role || !m.content) continue;
    const blocks = Array.isArray(m.content) ? m.content : [m.content];

    if (m.role === "user") {
      // Check if this is a toolResult message (skip it)
      const hasToolResult = blocks.some(
        (b: unknown) => isRecord(b) && b.toolResult,
      );
      if (hasToolResult) continue;

      // Regular user message
      const text = blocks
        .map(textFromBlock)
        .join("");
      if (text) msgs.push({ role: "user", content: text });
    } else if (m.role === "assistant") {
      let text = "";
      const toolEvents: Array<{ name: string; input: unknown }> = [];

      for (const block of blocks) {
        if (typeof block === "string") {
          text += block;
        } else if (!isRecord(block)) {
          continue;
        } else if (typeof block.text === "string") {
          text += block.text;
        } else if (isRecord(block.toolUse) && typeof block.toolUse.name === "string") {
          toolEvents.push({
            name: block.toolUse.name,
            input: block.toolUse.input,
          });
        }
        // Also handle the {"type": "text"/"tool_use"} format as fallback
        else if (block.type === "tool_use" && typeof block.name === "string") {
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

function extractPreview(messages: unknown[]): string {
  if (!Array.isArray(messages)) return "Empty chat";
  const firstUser = messages.find((message) =>
    isRecord(message) && message.role === "user" && Array.isArray(message.content) &&
    !message.content.some((block: unknown) => isRecord(block) && block.toolResult),
  );
  if (!isRecord(firstUser) || !Array.isArray(firstUser.content)) return "Empty chat";
  const text = firstUser.content.map(textFromBlock).join("");
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
      inert={!sidebarOpen}
      className={`flex flex-col border-b border-border sm:border-r sm:border-b-0 bg-card transition-all ${
        sidebarOpen ? "max-h-48 w-full shrink-0 sm:max-h-none sm:w-64" : "h-0 w-0 overflow-hidden border-0 sm:h-auto"
      }`}
    >
      <div className="flex items-center justify-between px-3 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          Chats
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSidebar}
          aria-label="Hide chat history"
          className="h-auto whitespace-normal rounded p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-accent"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </Button>
      </div>

      <Button

        variant="ghost"

        size="sm"
        onClick={onNewSession}
        className="h-auto whitespace-normal mx-3 mb-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-primary"
      >
        + New Chat
      </Button>

      <div className="flex-1 overflow-y-auto px-2">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`group mb-1 flex items-start gap-1 rounded-lg px-2.5 py-2 text-sm transition ${
              s.id === activeSessionId
                ? "bg-accent text-primary"
                : "text-muted-foreground hover:bg-muted dark:hover:bg-accent"
            }`}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSwitchSession(s.id)}
              className="h-auto whitespace-normal block min-w-0 flex-1 px-0 text-left"
            >
              <p className="truncate text-xs font-medium">{s.preview}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {new Date(s.updated_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(s.id);
              }}
              className="h-auto whitespace-normal mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-red-500 group-hover:opacity-100 focus-visible:opacity-100 dark:hover:text-red-400"
              title="Delete chat"
              aria-label={`Delete chat: ${s.preview}`}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ChatPanel ──────────────────────────────────────

export function ChatPanel({
  userEmail,
  initialMessage = "",
}: {
  userEmail?: string;
  initialMessage?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialMessage);
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(!initialMessage);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [supabase] = useState(() => createClient());
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const conversationVersion = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    const { data } = await supabase
      .from("agent_sessions")
      .select("id, updated_at, messages")
      .order("updated_at", { ascending: false })
      .limit(30);
    return data
      ? data.map((s: { id: string; updated_at: string; messages: unknown[] }) => ({
          id: s.id,
          updated_at: s.updated_at,
          preview: extractPreview(s.messages),
        }))
      : null;
  }, [supabase]);

  // Visits start empty. Saved messages load only when selected in the sidebar.
  useEffect(() => {
    let active = true;
    void loadSessions().then((data) => {
      if (active && data) setSessions(data);
    });
    return () => {
      active = false;
      conversationVersion.current += 1;
    };
  }, [loadSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading || !historyLoaded) return;
    const version = conversationVersion.current;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsLoading(true);

    try {
      const result: AgentResponse = await sendMessage(text, sessionId, userEmail);
      if (version !== conversationVersion.current) return;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.response, toolEvents: result.tool_events },
      ]);
    } catch (err: unknown) {
      if (version !== conversationVersion.current) return;
      const errorMessage = err instanceof Error ? err.message : "Unable to send your message. Please try again.";
      setInput(text);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${errorMessage}` },
      ]);
    } finally {
      if (version === conversationVersion.current) {
        setIsLoading(false);
        const data = await loadSessions();
        if (version === conversationVersion.current && data) setSessions(data);
      }
    }
  }

  function handleNewSession() {
    conversationVersion.current += 1;
    setSessionId(crypto.randomUUID());
    setMessages([]);
    setInput("");
    setIsLoading(false);
    setHistoryLoaded(true);
  }

  async function switchSession(id: string) {
    const version = ++conversationVersion.current;
    setSessionId(id);
    setMessages([]);
    setInput("");
    setIsLoading(false);
    setHistoryLoaded(false);

    try {
      const { data, error } = await supabase
        .from("agent_sessions")
        .select("messages")
        .eq("id", id)
        .single();
      if (version !== conversationVersion.current) return;
      if (error) throw new Error(error.message);
      setMessages(Array.isArray(data?.messages) ? parseSavedMessages(data.messages) : []);
      setHistoryLoaded(true);
    } catch {
      if (version !== conversationVersion.current) return;
      setMessages([{ role: "assistant", content: "Unable to load this conversation. Select it again to retry, or start a new chat." }]);
    }
  }

  async function deleteSession(id: string) {
    const version = conversationVersion.current;
    await supabase.from("agent_sessions").delete().eq("id", id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === sessionId && version === conversationVersion.current) {
      handleNewSession();
    }
  }

  const mdClasses =
    "text-sm [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_th]:border [&_th]:border-border [&_th]:bg-slate-200/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 dark:[&_th]:bg-card [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_p]:my-1 [&_pre]:bg-slate-800 [&_pre]:text-slate-200 [&_pre]:rounded [&_pre]:p-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_code]:text-primary [&_h1]:text-lg [&_h1]:font-bold [&_h1]:my-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:my-2 [&_h3]:font-bold [&_h3]:my-1";

  return (
    <div className="flex flex-col sm:flex-row h-[calc(var(--page-height)-8rem)] min-h-96 overflow-hidden rounded-lg border border-border bg-card dark:bg-background">
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 p-4">
          {!sidebarOpen && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="h-auto whitespace-normal mb-2 rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-muted hover:text-muted-foreground dark:hover:bg-accent"
              title="Show chat history"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Button>
          )}

          {messages.length === 0 && historyLoaded && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-lg font-medium text-muted-foreground">
                  Ask me anything about your benchmarks
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {[
                    "Run a cubic vs bbr test at 100 Mbit",
                    "Show my recent jobs",
                    "What CCAs are available?",
                  ].map((suggestion) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      key={suggestion}
                      type="button"
                      onClick={() => setInput(suggestion)}
                      className="h-auto max-w-full whitespace-normal rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border hover:text-primary dark:hover:border-primary/40"
                    >
                      {suggestion}
                    </Button>
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
                className={`max-w-[85%] rounded-lg px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground dark:bg-card"
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
              <div className="rounded-lg bg-muted px-4 py-3 dark:bg-card">
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
        <div className="border-t border-border p-4">
          <div className="flex items-end gap-2">
            <Textarea
              rows={3}
              aria-label="Chat message"
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
              className="min-w-0 flex-1 resize-y rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
            />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              aria-label="Send message"
              onClick={handleSend}
              disabled={isLoading || !historyLoaded || !input.trim()}
              className="h-auto whitespace-normal shrink-0 rounded-lg bg-primary p-2.5 text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
