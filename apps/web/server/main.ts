import { start } from "./app.ts";
import { StandaloneConfigError } from "./config-file.ts";
import { NextServerShapeError } from "./next-shape.ts";
import { startupFailedLine } from "./strings.ts";

// The image's entry point (`node apps/web/server/main.js`, #32 design 3.1 step 1). A failed start prints F1 and
// exits 1. Only the two classes whose messages are fixed strings (F2, F3) have their message printed: any other
// error's message may carry a path or a URL.

const ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export interface MainDeps {
  start: () => Promise<void>;
  logError: (line: string) => void;
  exit: (code: number) => void;
}

/** F1 for a rejection of `start()`; a value that is not an Error is named `NonError`, never stringified. */
export function startupFailure(error: unknown): string {
  if (!(error instanceof Error)) return startupFailedLine("NonError", "unexpected");
  const name = ERROR_NAME.test(error.name) ? error.name : "Error";
  const isFixedMessage =
    error instanceof StandaloneConfigError || error instanceof NextServerShapeError;
  return startupFailedLine(name, isFixedMessage ? error.message : "unexpected");
}

export async function main(deps: MainDeps): Promise<void> {
  try {
    await deps.start();
  } catch (error: unknown) {
    deps.logError(startupFailure(error));
    deps.exit(1);
  }
}

await main({
  start,
  logError: (line) => console.error(line),
  exit: (code) => process.exit(code),
});
