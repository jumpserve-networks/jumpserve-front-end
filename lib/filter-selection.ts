/** Apply a controlled checkbox change, preserving order and duplicate-event safety. */
export function updateFilterSelection<T extends string | number>(current: T[], value: T, checked: boolean): T[] {
  if (!checked) return current.filter(item => item !== value);
  if (current.includes(value)) return current;
  return [...current, value];
}
