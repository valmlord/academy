import { LineCounter, parseDocument } from "yaml";
import { CourseReadError } from "../errors.js";

/**
 * The parsed value of a course YAML file, with ADR-0009 item 7's rules (a known copy of the web's
 * `apps/web/lib/course/yaml.ts`, design 4.8). Any error or warning fails closed as "invalid YAML at line
 * <n>": `prettyErrors: false` keeps the source line out of every message, and `logLevel: "error"` stops
 * `toJS()` from printing a collection key through process warnings while still reporting a second YAML
 * document ("silent" would drop that error). The library's messages are never used.
 */
export function parseYamlFile(text: string, file: string): unknown {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false, logLevel: "error" });
  const issue = doc.errors[0] ?? doc.warnings[0];
  if (issue !== undefined) {
    const { line } = lineCounter.linePos(issue.pos[0]);
    throw new CourseReadError(file, `invalid YAML at line ${line}`);
  }
  return doc.toJS();
}
