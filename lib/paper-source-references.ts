import type { PaperText } from "./paper-intake-model";

export const PAPER_SOURCE_FORMAT = "paper_breakdown_sources_v2";
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
export function resolvePaperSources(value: unknown, paper: PaperText): unknown {
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
