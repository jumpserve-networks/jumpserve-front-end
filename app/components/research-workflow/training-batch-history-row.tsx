"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { TableCell, TableRow } from "@/app/components/ui/table";
import { TRAINING_BATCH_PATH } from "@/lib/test-modules";

export function TrainingBatchHistoryRow({ batchId, children }: { batchId: number; children: ReactNode }) {
  const router = useRouter();
  const href = `${TRAINING_BATCH_PATH}/${batchId}`;

  function openBatch(event: MouseEvent<HTMLTableRowElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        (event.target instanceof Element && event.target.closest("a, button")) ||
        event.currentTarget.ownerDocument.getSelection()?.type === "Range") return;

    router.push(href);
  }

  return <TableRow className="cursor-pointer focus-within:bg-muted/50" onClick={openBatch}>
    <TableCell><Link aria-label={`View batch ${batchId}`} prefetch={false} href={href}>{batchId}</Link></TableCell>
    {children}
  </TableRow>;
}
