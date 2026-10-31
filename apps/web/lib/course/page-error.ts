import { CourseReadError } from "./errors";

export type Loaded<T> = { ok: true; value: T } | { ok: false; error: CourseReadError };

/**
 * Runs a course read for a page: a `CourseReadError` becomes the designed course-error state, anything
 * else (a session or database failure, a programming error) is rethrown, so it is never shown as a
 * course that failed to load.
 */
export async function loadOrError<T>(load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await load() };
  } catch (error) {
    if (error instanceof CourseReadError) return { ok: false, error };
    throw error;
  }
}
