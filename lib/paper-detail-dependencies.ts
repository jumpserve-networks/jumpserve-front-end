export type DependencyDetail = { id: string; depends_on?: string[] };

/** References stay within one section. Missing, repeated and cyclic prerequisites fail closed. */
export function validPaperDependencies(items: { id: string; depends_on?: unknown }[]): boolean {
  const byId = new Map(items.map(item => [item.id, item]));
  const visited = new Set<string>(), visiting = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    const item = byId.get(id);
    if (!item) return false;
    const refs = item.depends_on ?? [];
    if (item.depends_on === null || !Array.isArray(refs) || refs.length > 7 || new Set(refs).size !== refs.length || refs.some(ref => typeof ref !== "string" || ref === id || !byId.has(ref))) return false;
    visiting.add(id);
    if (!refs.every(visit)) return false;
    visiting.delete(id); visited.add(id);
    return true;
  }
  return byId.size === items.length && items.every(item => visit(item.id));
}

export function paperDependencyClosure(items: DependencyDetail[], id: string, direction: "prerequisites" | "dependents"): Set<string> {
  const result = new Set([id]), pending = [id];
  while (pending.length) {
    const current = pending.pop()!;
    const related = direction === "prerequisites" ? items.find(item => item.id === current)?.depends_on ?? [] : items.filter(item => item.depends_on?.includes(current)).map(item => item.id);
    for (const ref of related) if (!result.has(ref)) { result.add(ref); pending.push(ref); }
  }
  return result;
}

export type PaperDetailNode<T> = { item: T; index: number; number: string; children: PaperDetailNode<T>[] };
/** The first prerequisite is the primary parent; additional dependencies retain separate references. */
export function paperDetailTree<T extends DependencyDetail>(items: T[], prefix: string): PaperDetailNode<T>[] {
  if (!validPaperDependencies(items)) throw new Error("Invalid paper detail dependencies.");
  const children = new Map<string | undefined, { item: T; index: number }[]>();
  items.forEach((item, index) => {
    const parent = item.depends_on?.[0];
    children.set(parent, [...children.get(parent) ?? [], { item, index }]);
  });
  const build = (parent: string | undefined, path: string): PaperDetailNode<T>[] => (children.get(parent) ?? []).map(({ item, index }, position) => {
    const number = `${path}.${position + 1}`;
    return { item, index, number, children: build(item.id, number) };
  });
  return build(undefined, prefix);
}

export function flattenPaperDetailTree<T>(nodes: PaperDetailNode<T>[]): PaperDetailNode<T>[] {
  return nodes.flatMap(node => [node, ...flattenPaperDetailTree(node.children)]);
}
