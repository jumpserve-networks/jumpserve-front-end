"use client";

import type { ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/app/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/app/components/ui/popover";

type FilterDropdownProps = {
  label: string;
  summary: ReactNode;
  children: ReactNode;
  className?: string;
};

/** A filter panel that keeps multi-select and ordered-filter controls together. */
export function FilterDropdown({
  label,
  summary,
  children,
  className,
}: FilterDropdownProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" />}
        className={cn(
          "group h-auto min-h-10 w-full min-w-0 justify-between rounded-xl px-3 py-2 text-left font-normal whitespace-normal data-popup-open:border-ring",
          className,
        )}
      >
        <span className="sr-only">{label}: </span>
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-data-popup-open:rotate-180"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[min(28rem,var(--available-height))] w-(--anchor-width) max-w-(--available-width) gap-0 overflow-y-auto overscroll-contain rounded-xl p-2.5"
      >
        <PopoverTitle className="sr-only">{label} filters</PopoverTitle>
        {children}
      </PopoverContent>
    </Popover>
  );
}
