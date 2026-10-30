import { inspect } from "node:util";

// How deep a canary may sit inside a logged object and still be seen; deeper than any error chain the
// tests build.
const INSPECT_DEPTH = 10;

/**
 * Every argument of every recorded call, rendered the way console.* renders it (util.inspect), so a
 * secret in any property of a logged object is visible. Never String(arg): an object prints as
 * "[object Object]" there and hides what a real logger shows.
 */
export function serialised(calls: readonly (readonly unknown[])[]): string {
  return calls
    .flat()
    .map((argument) => inspect(argument, { depth: INSPECT_DEPTH }))
    .join("\n");
}
