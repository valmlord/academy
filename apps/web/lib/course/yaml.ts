import { LineCounter, parseDocument } from "yaml";
import { CourseFileError } from "./errors";

/**
 * The parsed value of a course YAML file. Any error or warning fails closed as "invalid YAML at line <n>":
 * `prettyErrors: false` keeps the source line out of every message, and `logLevel: "error"` stops
 * `toJS()` from printing a collection key through process warnings, while still reporting a second YAML
 * document ("silent" would drop that error). The library's messages are never used.
 */
export function parseYamlFile(text: string, file: string): unknown {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false, logLevel: "error" });
  const issue = doc.errors[0] ?? doc.warnings[0];
  if (issue !== undefined) {
    const { line } = lineCounter.linePos(issue.pos[0]);
    throw new CourseFileError(file, `invalid YAML at line ${line}`);
  }
  return doc.toJS();
}
