"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { TEST_MODULES } from "@/lib/test-modules";

const RESULT_MODULES = TEST_MODULES.filter((module) => module.id !== "research-verification");

export function PreviousStudyResults() {
  const [titleFilter, setTitleFilter] = useState("");
  const inputId = useId();
  const countId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const query = titleFilter.trim().toLowerCase();
  const matches = RESULT_MODULES.filter((module) => module.name.toLowerCase().includes(query));

  return (
    <div className="mt-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
        <div className="w-full space-y-2 sm:max-w-md">
          <label htmlFor={inputId} className="text-sm font-medium">Filter by title</label>
          <Input
            ref={inputRef}
            id={inputId}
            type="search"
            value={titleFilter}
            onChange={(event) => setTitleFilter(event.target.value)}
            placeholder="Search assessment or test titles…"
            aria-describedby={countId}
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={titleFilter.length === 0}
          onClick={() => {
            setTitleFilter("");
            inputRef.current?.focus();
          }}
        >
          Clear filter
        </Button>
      </div>
      <p id={countId} role="status" className="mt-3 text-xs text-muted-foreground">
        {matches.length} of {RESULT_MODULES.length} titles
      </p>
      <Card className="mt-3 gap-0 divide-y divide-border py-0">
        {matches.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground sm:p-6">
            No titles match your filter. Try a different title or clear the filter.
          </p>
        ) : matches.map((module) => {
          const results = module.sections.find((section) => section.label === "Test Results" || section.label === "Test Lookup");

          return (
            <div key={module.id} className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8 sm:p-6">
              <div>
                <h3 className="text-base font-semibold text-foreground">{module.name}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{module.description}</p>
              </div>
              {module.status === "available" ? (
                <div className="flex flex-wrap items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
                  <Button variant="outline" nativeButton={false} render={<Link href={results?.href ?? module.href} />}>
                    View results<ArrowRight aria-hidden="true" />
                  </Button>
                  <Link href={module.href} className="text-xs text-muted-foreground underline underline-offset-4">Methods &amp; tools</Link>
                </div>
              ) : <Button variant="outline" disabled>Coming soon</Button>}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
