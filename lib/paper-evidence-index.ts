import type { PaperSource } from "./paper-source-references";

// Navigation only: matching a term is not proof of entailment. These precise
// configuration terms also catch descriptions citing a neighboring paragraph
// rather than the paragraph that actually names the parameter.
export const PAPER_PARAMETER_TERMS = [
  { name: "MTU", pattern: /\bMTU\b/iu },
  { name: "offload", pattern: /\boffload(?:s|ing)?\b/iu },
  { name: "pacing", pattern: /\bpacing\b/iu },
  { name: "socket buffers", pattern: /\bsocket[\s-]+buffers?\b/iu },
] as const;
const navigationTerms = [...PAPER_PARAMETER_TERMS,
  { name: "queue limits", pattern: /\bqueue[ -]+limits?\b/iu },
  { name: "replication/minimum scope", pattern: /\b(?:replication|minimum)\b/iu },
  { name: "uncertainty", pattern: /\b(?:variance|confidence|uncertainty)\b/iu },
  { name: "provenance disclosure", pattern: /\b(?:fabricated|invented|synthetic)\b/iu },
];

export function paperSourceNavigation(sources: PaperSource[], page: number) {
  const matches = navigationTerms.map(term => ({ name: term.name, refs: sources.filter(s => s.page === page && term.pattern.test(s.quote)).map(s => s.ref) })).filter(t => t.refs.length);
  return matches.length ? `Application keyword navigation (not author statements or supporting quotations): ${matches.map(t => `${t.name}: ${t.refs.join(", ")}`).join("; ")}.\n\n` : "";
}
