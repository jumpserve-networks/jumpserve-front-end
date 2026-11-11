type QueryError = { code?: string; message?: string };

/** Keep reads usable before the deletion migration, without masking other failures. */
export async function readWithAssessmentDeletion<T extends { error: QueryError | null }>(read: (filterDeleted: boolean) => PromiseLike<T>): Promise<T> {
  const result = await read(true);
  // 42703 is PostgreSQL's undefined-column result. A schema-cache error alone
  // does not establish that the database lacks deletion support.
  if (result.error?.code === "42703" && /\bdeleted_at\b/.test(result.error.message ?? "")) return read(false);
  // Never cache an absent column: the migration can be applied while the app runs.
  return result;
}
