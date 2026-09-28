/** Bounded retries for read-only measurement queries; never used for mutations. */
export class StudyQueryError extends Error {
  readonly retryable: boolean;

  constructor(message: string, status?: number) {
    super(`Unable to load study measurements: ${message}`);
    this.name = "StudyQueryError";
    this.retryable = [502, 503, 504].includes(status ?? -1) ||
      /^(?:TypeError: )?fetch failed/i.test(message);
  }
}

export async function readStudy<T>(query: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await query();
    } catch (error) {
      if (!(error instanceof StudyQueryError) || !error.retryable || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}
