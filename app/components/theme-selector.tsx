"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import {
  getServerThemePreferenceSnapshot,
  getThemePreferenceSnapshot,
  setThemePreference,
  subscribeToThemePreference,
  type ThemePreference,
} from "@/lib/theme-preference";

const THEME_OPTIONS = [
  { value: "dark", label: "Dark Mode", Icon: Moon },
  { value: "light", label: "Light Mode", Icon: Sun },
  { value: "system", label: "System Default", Icon: Monitor },
] satisfies { value: ThemePreference; label: string; Icon: typeof Monitor }[];

export function ThemeSelector({ variant = "select" }: { variant?: "select" | "icons" }) {
  const preference = useSyncExternalStore(
    subscribeToThemePreference,
    () => getThemePreferenceSnapshot().preference,
    () => getServerThemePreferenceSnapshot().preference,
  );
  if (variant === "icons") {
    return (
      <div role="group" aria-label="Color theme" className="flex shrink-0 items-center rounded-md border border-border p-0.5">
        {THEME_OPTIONS.map(({ value, label, Icon }) => (
          <Button
            key={value}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={preference === value}
            title={label}
            onClick={() => setThemePreference(value)}
            className="size-7 text-muted-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground sm:size-8"
          >
            <Icon aria-hidden="true" className="size-4" />
          </Button>
        ))}
      </div>
    );
  }

  const Icon = THEME_OPTIONS.find((option) => option.value === preference)!.Icon;

  return (
    <Select items={THEME_OPTIONS} value={preference} onValueChange={(value) => { if (value) setThemePreference(value); }}>
      <SelectTrigger aria-label="Theme" className="w-full">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent side="top" align="start" alignItemWithTrigger={false}>
        {THEME_OPTIONS.map(({ value, label, Icon: OptionIcon }) => (
          <SelectItem key={value} value={value}>
            <span className="flex items-center gap-2"><OptionIcon aria-hidden="true" className="size-4" />{label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
