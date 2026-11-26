"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { SYNTHETIC_BATCH_START_PATH, TRAINING_BATCH_PATH } from "@/lib/test-modules";
import { isTrainingBatchId } from "@/lib/training-batch";

export function StartSyntheticBatch() {
  const router = useRouter();
  const pending = useRef(false);
  const [status, setStatus] = useState<"idle" | "pending" | "unconfirmed">("idle");

  async function start() {
    if (pending.current) return;
    pending.current = true;
    setStatus("pending");
    try {
      const response = await fetch(SYNTHETIC_BATCH_START_PATH, { method: "POST" });
      const data = response.status === 202 ? await response.json() : null;
      if (isTrainingBatchId(data?.batchId)) {
        router.push(`${TRAINING_BATCH_PATH}/${data.batchId}`);
        return;
      }
      throw new Error("Missing batch ID");
    } catch {
      pending.current = false;
      setStatus("unconfirmed");
    }
  }

  return <div className="flex flex-wrap items-center gap-3">
    <Button type="button" size="sm" onClick={start} disabled={status === "pending"}>
      {status === "pending" ? "Requesting start…" : "Start synthetic batch"}
    </Button>
    {status === "unconfirmed" ? <p role="alert" className="text-sm">The batch start request could not be confirmed.</p> : null}
  </div>;
}
