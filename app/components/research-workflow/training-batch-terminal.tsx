"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TrainingBatchStep } from "@/lib/training-batch";

const endpoint = process.env.NEXT_PUBLIC_JUMPSERVE_TRAINING_TERMINAL_URL;
const terminalUrl = /^wss:\/\/[a-z0-9]+\.execute-api\.us-east-1\.amazonaws\.com\/terminal$/.test(endpoint ?? "") ? endpoint : undefined;
const protocol = "jumpserve-terminal-v1";
const displayLimit = 2_000_000;

type TerminalMessage = {
  stage: string;
  role: TrainingBatchStep;
  lost: boolean;
  output: { sequence: number; stream: "stdout" | "stderr" | "pty" | "notice"; text: string }[];
};

export function TrainingBatchTerminal({ batchId, paperId, active, role }:
  { batchId: number; paperId: string; active: boolean; role: TrainingBatchStep }) {
  const [status, setStatus] = useState("Connecting to the live terminal…");
  const [output, setOutput] = useState("");
  const terminal = useRef<HTMLPreElement>(null);
  const followOutput = useRef(true);

  useEffect(() => {
    if (terminal.current && followOutput.current) terminal.current.scrollTop = terminal.current.scrollHeight;
  }, [output]);

  useEffect(() => {
    if (!terminalUrl || !active) return;
    const url = new URL(terminalUrl);
    url.search = new URLSearchParams({ batch: String(batchId), paper: paperId }).toString();
    const supabase = createClient();
    const positions = new Map<string, number>();
    let stopped = false;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    let expires: ReturnType<typeof setTimeout>;
    let failures = 0;

    function reconnect() {
      clearTimeout(expires);
      if (stopped) return;
      setStatus("Reconnecting to the live terminal…");
      retry = setTimeout(connect, Math.min(20_000, 1_000 * 2 ** Math.min(failures++, 5)));
    }

    async function connect() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (stopped) return;
        if (error) throw error;
        if (!session?.access_token) {
          setStatus("Sign in again to view the live terminal.");
          return;
        }
        const connection = new WebSocket(url, [protocol, session.access_token]);
        socket = connection;
        connection.binaryType = "arraybuffer";
        connection.addEventListener("open", () => {
          if (stopped) return;
          failures = 0;
          setStatus("Connected. Waiting for command output…");
          if (session.expires_at) {
            expires = setTimeout(() => connection.close(), Math.max(1_000, session.expires_at * 1_000 - Date.now()));
          }
        });
        connection.addEventListener("message", ({ data }) => {
          if (stopped) return;
          const payload = typeof data === "string" ? data : data instanceof ArrayBuffer ? new TextDecoder().decode(data) : "";
          if (!payload || payload.length > 32_768) return;
          let message: TerminalMessage;
          try { message = JSON.parse(payload); } catch { return; }
          if (typeof message?.stage !== "string" || message.role !== role || !Array.isArray(message.output)) return;
          const seen = positions.get(message.stage) ?? 0;
          const next = message.output.filter(frame => Number.isInteger(frame?.sequence) &&
            frame.sequence > seen && typeof frame.text === "string");
          if (!next.length) return;
          setStatus("Live · read only");
          positions.set(message.stage, next[next.length - 1].sequence);
          const gap = message.lost || next[0].sequence > seen + 1 ? "[Some earlier output is unavailable.]\n" : "";
          const text = gap + next.map(frame => frame.text).join("");
          setOutput(previous => (previous + text).slice(-displayLimit));
        });
        connection.addEventListener("close", reconnect, { once: true });
      } catch {
        reconnect();
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event !== "SIGNED_OUT") return;
      stopped = true;
      clearTimeout(retry);
      clearTimeout(expires);
      socket?.close();
      setOutput("");
      setStatus("Sign in again to view the live terminal.");
    });
    void connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(expires);
      subscription.unsubscribe();
      socket?.close();
    };
  }, [active, batchId, paperId, role]);

  if (!terminalUrl || (!active && !output)) return null;
  return <section className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Terminal output</h3>
      <p role="status" className="text-xs text-muted-foreground">{active ? status : "Live stream ended"}</p>
    </div>
    <pre ref={terminal} tabIndex={0} aria-label="Read-only terminal output"
      onScroll={event => {
        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
        followOutput.current = scrollHeight - scrollTop - clientHeight < 48;
      }}
      className="max-h-[45vh] min-h-24 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-3 font-mono text-xs">
      {output.length === displayLimit ? "[Showing recent output.]\n" : ""}{output}
    </pre>
  </section>;
}
