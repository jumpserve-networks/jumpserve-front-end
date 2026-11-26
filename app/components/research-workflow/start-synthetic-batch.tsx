"use client";

import { useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { SYNTHETIC_BATCH_START_PATH } from "@/lib/test-modules";

export function StartSyntheticBatch() {
  const pending = useRef(false);
  const [status, setStatus] = useState<"idle" | "pending" | "requested" | "unconfirmed">("idle");

  async function start() {
    if (pending.current) return;
    pending.current = true;
    setStatus("pending");
    try {
      const response = await fetch(SYNTHETIC_BATCH_START_PATH, { method: "POST" });
      setStatus(response.status === 202 ? "requested" : "unconfirmed");
    } catch {
      setStatus("unconfirmed");
    } finally {
      pending.current = false;
    }
  }

  return <div className="flex flex-wrap items-center gap-3">
    <Button type="button" size="sm" onClick={start} disabled={status === "pending"}>
      {status === "pending" ? "Requesting start…" : "Start synthetic batch"}
    </Button>
    {status === "requested" ? <p role="status" className="text-sm text-muted-foreground">AWS accepted the batch start request.</p> : null}
    {status === "unconfirmed" ? <p role="alert" className="text-sm">The batch start request could not be confirmed.</p> : null}
  </div>;
}
