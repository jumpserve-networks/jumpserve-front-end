import type { PaperText } from "./paper-intake-model";

export const PAPER_SOURCE_FORMAT = "paper_breakdown_sources_v2";
export const PAPER_SOURCE_FORMAT_V3 = "paper_breakdown_sources_v3";
export const PAPER_SOURCE_FORMAT_V4 = "paper_breakdown_sources_v4";
export const PAPER_SOURCE_FORMAT_V5 = "paper_breakdown_sources_v5";
export type PaperSource = { ref: string; page: number; quote: string; start: number; end: number };

/** Complete, deterministic slices of retained text. No generated quotation text. */
export function paperSources(paper: PaperText): PaperSource[] {
  const sources: PaperSource[] = [];
  for (const page of paper.pages) {
    let start = 0, index = 0;
    while (start < page.text.length) {
      let end = Math.min(start + 600, page.text.length);
      if (end < page.text.length) {
        const line = page.text.lastIndexOf("\n", end), word = page.text.lastIndexOf(" ", end);
        if (line > start + 300) end = line;
        else if (word > start + 300) end = word;
        // Do not split a UTF-16 surrogate pair.
        if (/[\uD800-\uDBFF]/u.test(page.text[end - 1])) end--;
      }
      const quote = page.text.slice(start, end);
      if (quote.trim()) sources.push({ ref: `p${page.page}s${++index}`, page: page.page, quote, start, end });
      start = end;
    }
  }
  if (!sources.length || sources.length > 1000) throw new Error("The complete paper exceeds the bounded source-reference limit. No text was truncated.");
  return sources;
}

export function sourceLabeledPages(paper: PaperText, sources: PaperSource[]) {
  return paper.pages.map(page => {
    let cursor = 0;
    const parts: string[] = [];
    for (const source of sources.filter(source => source.page === page.page)) {
      parts.push(page.text.slice(cursor, source.start), cursor ? "\n" : "", `[${source.ref}]\n`, source.quote);
      cursor = source.end;
    }
    parts.push(page.text.slice(cursor));
    return { page: page.page, text: parts.join("") };
  });
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
function metadataQuote(value: unknown, page: string, maximum: number, label: string) {
  if (typeof value !== "string" || !value.trim() || [...value].length > maximum) throw new Error(`Invalid ${label} metadata.`);
  const pattern = value.trim().split(/\s+/u).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const match = new RegExp(pattern, "u").exec(page);
  if (!match) throw new Error(`The ${label} does not occur unchanged on its referenced PDF page.`);
  return match[0];
}

/** Resolve IDs on the server, then run the unchanged exact-quote validator. */
export function resolvePaperSources(value: unknown, paper: PaperText, structured = false, scopedSpecification = false): unknown {
  if (structured) return resolveStructuredPaperSources(value, paper, scopedSpecification);
  if (!object(value) || !keys(value, ["title", "domain", "authors", "sections"]) || !Array.isArray(value.authors) || value.authors.length > 100 || !object(value.sections) || !keys(value.sections, ["access", "experiment", "data", "validate"])) throw new Error("The model did not return the complete source-referenced breakdown.");
  const sources = new Map(paperSources(paper).map(source => [source.ref, source]));
  function resolve(field: unknown, key: "text" | "name" | "description", label: string, exactMetadata = false) {
    if (!object(field) || !keys(field, ["source_ref", key]) || typeof field.source_ref !== "string") throw new Error(`Invalid source reference for ${label}.`);
    const source = sources.get(field.source_ref);
    if (!source) throw new Error(`The source reference for ${label} is not in this retained paper.`);
    const quote = exactMetadata ? metadataQuote(field[key], source.quote, key === "name" ? 200 : 300, label) : source.quote;
    return { [key]: field[key], quote, page: source.page };
  }
  return {
    title: value.title === null ? null : resolve(value.title, "text", "title", true),
    domain: value.domain === null ? null : resolve(value.domain, "text", "domain"),
    authors: value.authors.map((field, index) => resolve(field, "name", `author ${index + 1}`, true)),
    sections: Object.fromEntries(["access", "experiment", "data", "validate"].map(section => {
      const fields = (value.sections as Record<string, unknown>)[section];
      if (!Array.isArray(fields) || fields.length > 8) throw new Error("Paper section detail bounds were exceeded.");
      return [section, fields.map((field, index) => resolve(field, "description", `${section} detail ${index + 1}`))];
    })),
  };
}

/** Multiple passages can support a description; each passage keeps its own PDF page. */
export function resolveStructuredPaperSources(value: unknown, paper: PaperText, scopedSpecification = false): unknown {
  if (!object(value) || !keys(value, ["title", "domain", "authors", "sections", "provenance", "implementation_choices"]) || !object(value.sections) || !keys(value.sections, ["access", "experiment", "data", "validate"])) throw new Error("The structured paper breakdown is incomplete.");
  const sourceMap = new Map(paperSources(paper).map(s => [s.ref, s]));
  function citations(refs: unknown, allowEmpty = false) {
    if (!Array.isArray(refs) || refs.length < (allowEmpty ? 0 : 1) || refs.length > (scopedSpecification ? 12 : 6) || new Set(refs).size !== refs.length || !refs.every(r => typeof r === "string" && sourceMap.has(r))) throw new Error("Every supporting passage must identify a retained source block within the citation bound.");
    return refs.map(ref => { const source = sourceMap.get(ref)!; return { quote: source.quote, page: source.page }; });
  }
  const legacySections: Record<string, unknown[]> = {}, enhanced: Record<string, unknown[]> = {};
  for (const section of ["access", "experiment", "data", "validate"]) {
    const entries = value.sections[section];
    if (!Array.isArray(entries) || entries.length > 8) throw new Error("Paper section detail bounds were exceeded.");
    enhanced[section] = entries.map(entry => {
      if (!object(entry) || !keys(entry, ["source_refs", "description", "kind", "label", "criterion", "specification"])) throw new Error("Invalid structured paper detail.");
      let specification = entry.specification;
      let refs = entry.source_refs;
      if (scopedSpecification && entry.kind === "experiment_specification") {
        if (!object(specification) || !keys(specification, ["setup", "conditions", "procedure", "comparisons"])) throw new Error("Each experiment field needs its own source references.");
        const fields = Object.entries(specification).map(([key, field]) => {
          if (!object(field) || !keys(field, ["text", "source_refs"])) throw new Error("Each experiment field needs text and source references.");
          citations(field.source_refs);
          return { key, text: field.text, refs: field.source_refs as string[] };
        });
        citations(refs);
        refs = [...new Set([...(refs as string[]), ...fields.flatMap(f => f.refs)])];
        specification = Object.fromEntries(fields.map(f => [f.key, f.text]));
      }
      const evidence = citations(refs);
      if (section === "experiment" && entry.kind !== "experiment_specification" || entry.kind === "experiment_specification" && section !== "experiment" || entry.kind === "claim" && section !== "validate" || entry.kind === "reported_result" && section !== "data") throw new Error("Paper details must retain their experiment, claim and result roles.");
      return { description: entry.description, ...evidence[0], citations: evidence, kind: entry.kind, label: entry.label, criterion: entry.criterion, specification };
    });
    legacySections[section] = entries.map(entry => ({ description: entry.description, source_ref: entry.source_refs[0] }));
  }
  const legacy = resolvePaperSources({ title: value.title, domain: value.domain, authors: value.authors, sections: legacySections }, paper) as Record<string, unknown>;
  const provenance = value.provenance;
  if (!object(provenance) || !keys(provenance, ["classification", "statement", "source_refs"]) || !Array.isArray(value.implementation_choices) || value.implementation_choices.length > 8) throw new Error("Document provenance and implementation choices are required.");
  return { ...legacy, sections: enhanced,
    provenance: { classification: provenance.classification, statement: provenance.statement, citations: citations(provenance.source_refs, provenance.classification === "unspecified") },
    implementation_choices: value.implementation_choices.map(choice => {
      if (!object(choice) || !keys(choice, ["name", "reason", "source_refs"])) throw new Error("Invalid implementation choice.");
      return { name: choice.name, reason: choice.reason, citations: citations(choice.source_refs) };
    }),
  };
}
