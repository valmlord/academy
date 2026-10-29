/** Assertion helpers shared by the unit and the integration suites; Docker-free. */
import { inspect } from "node:util";

type ErrorClass<T extends Error> = new (...args: never[]) => T;

/** What a logger prints for a value, so a secret in any property of any cause is visible here. */
export function inspected(value: unknown): string {
  return inspect(value, { depth: Number.POSITIVE_INFINITY });
}

function narrowed<T extends Error>(error: unknown, type: ErrorClass<T>): T {
  if (error instanceof type) {
    return error;
  }
  const actual = error instanceof Error ? `${error.name}: ${error.message}` : typeof error;
  throw new Error(`expected ${type.name}, got ${actual}`);
}

/** Awaits the promise and returns its rejection, failing unless it is an instance of `type`. */
export async function rejectionOf<T extends Error>(
  promise: Promise<unknown>,
  type: ErrorClass<T>,
): Promise<T> {
  try {
    await promise;
  } catch (error: unknown) {
    return narrowed(error, type);
  }
  throw new Error(`expected ${type.name}, but the promise resolved`);
}

/** Runs the action and returns what it throws, failing unless it is an instance of `type`. */
export function thrownBy<T extends Error>(action: () => unknown, type: ErrorClass<T>): T {
  try {
    action();
  } catch (error: unknown) {
    return narrowed(error, type);
  }
  throw new Error(`expected ${type.name}, but nothing was thrown`);
}

/** Every string `code` along the cause chain, outermost first (SQLSTATEs and Node error codes). */
export function causeCodes(error: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = error;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && typeof current.code === "string") {
      codes.push(current.code);
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return codes;
}
