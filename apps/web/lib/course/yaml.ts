import { LineCounter, parseDocument } from "yaml";
import { CourseFileError } from "./errors";

// The first reason is byte for byte content:validate's (packages/lesson-schema/src/validate.ts), so one
// file gets one text everywhere; the pair moves to a single place in #118.
const ALIAS_REASON = "invalid YAML: alias cannot be resolved (unknown anchor or too many aliases)";
const CONVERSION_REASON = "invalid YAML: document cannot be converted to a value";

/**
 * The parsed value of a course YAML file. Any error or warning fails closed as "invalid YAML at line <n>":
 * `prettyErrors: false` keeps the source line out of every message, and `logLevel: "error"` stops
 * `toJS()` from printing a collection key through process warnings, while still reporting a second YAML
 * document ("silent" would drop that error). A document that parses but cannot be converted fails closed
 * with one of two fixed reasons and no line, because the library gives no position for it; the alias
 * reason matches content:validate's. The library's messages are never used.
 */
export function parseYamlFile(text: string, file: string): unknown {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false, logLevel: "error" });
  const issue = doc.errors[0] ?? doc.warnings[0];
  if (issue !== undefined) {
    const { line } = lineCounter.linePos(issue.pos[0]);
    throw new CourseFileError(file, `invalid YAML at line ${line}`);
  }
  try {
    return doc.toJS();
  } catch (error: unknown) {
    // Only library code runs in toJS here, so a throw comes from the file's content (or a library bug,
    // which then fails closed too). The class only picks the wording: a 1.1 merge source that is not a
    // map throws a plain Error, not a ReferenceError.
    // The library error is dropped, not attached as a cause: an unresolved alias's message quotes its name.
    const reason = error instanceof ReferenceError ? ALIAS_REASON : CONVERSION_REASON;
    throw new CourseFileError(file, reason);
  }
}
