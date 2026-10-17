"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
export function ResearchSelect({ value, onChange, options, label, required = false, disabled = false }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; label: string; required?: boolean; disabled?: boolean }) {
  return <Select value={value} onValueChange={selected => onChange(selected ?? "")} items={options} required={required} disabled={disabled}><SelectTrigger aria-label={label} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
}
