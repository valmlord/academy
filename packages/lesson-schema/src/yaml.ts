// ADR-0009 item 7's YAML rules for course.yaml, module.yaml and lesson.yaml, shared by content:validate and the
// course loaders of the web and the workspace service. Imports only `yaml`, so the web can use it without reaching
// validate.js and its node:fs walks (ADR-0009 item 4).
import { type ErrorCode, LineCounter, parseDocument } from "yaml";

export type CourseYamlParse =
  | { readonly kind: "value"; readonly value: unknown }
  /**
   * The parser's first error, else its first warning (a warning fails closed too): the 1-based line where it
   * starts and the library's code, a closed enum. Never its message, which can quote file text (an unresolved
   * tag's names the tag).
   */
  | { readonly kind: "parse"; readonly line: number; readonly code: ErrorCode }
  /**
   * toJS() threw a ReferenceError. The library throws one for an alias with no anchor before it, outside a YAML
   * 1.1 merge key, and for any alias, merge source or not, past its default alias limit (for example 100 aliases
   * to one scalar anchor). Carries nothing: the unresolved-alias message names the alias.
   */
  | { readonly kind: "alias" }
  /**
   * toJS() threw anything other than a ReferenceError, for example a YAML 1.1 merge key whose source is not a
   * map, or an unresolved alias used as a merge source, which yaml 2.9.1 reports as a plain Error. Carries
   * nothing: the thrown message is the library's, and every caller gives the same fixed reason.
   */
  | { readonly kind: "conversion" };

export type CourseYamlFailure = Exclude<CourseYamlParse, { kind: "value" }>;

// toJS() throws a ReferenceError with no position for an alias with no anchor before it, outside a YAML 1.1
// merge key, and for any alias past the alias limit, so this reason names both causes and gives no line rather
// than a guessed one. With yaml 2.9.1 an unresolved alias used as a merge source throws a plain Error, so it is a
// conversion failure.
const ALIAS_REASON = "invalid YAML: alias cannot be resolved (unknown anchor or too many aliases)";

// Any other throw from toJS(), for example a YAML 1.1 merge source that is not a map. The library gives no
// position for it either.
const CONVERSION_REASON = "invalid YAML: document cannot be converted to a value";

/**
 * One course YAML file's text under ADR-0009 item 7. Pretty errors are off, which keeps the source line out of
 * the library's messages. The log level is "error": it stops toJS() from printing a collection key through
 * process warnings and still reports a second document, which "silent" would drop. A document with an error or
 * a warning is never converted. No reviver or custom tag is passed, so only library code runs in toJS(). Only
 * toJS() is guarded: what parseDocument throws propagates.
 */
export function parseCourseYaml(text: string): CourseYamlParse {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false, logLevel: "error" });
  const issue = doc.errors[0] ?? doc.warnings[0];
  if (issue !== undefined) {
    return { kind: "parse", line: lineCounter.linePos(issue.pos[0]).line, code: issue.code };
  }
  try {
    const value: unknown = doc.toJS();
    return { kind: "value", value };
  } catch (error: unknown) {
    if (error instanceof ReferenceError) return { kind: "alias" };
    return { kind: "conversion" };
  }
}

/**
 * The reason the web loader and the workspace service give for a failed parse. content:validate gives the same
 * text for an alias or a conversion failure, and for a parse failure with " (<code>)" appended.
 */
export function courseYamlReason(failure: CourseYamlFailure): string {
  switch (failure.kind) {
    case "parse":
      return `invalid YAML at line ${failure.line}`;
    case "alias":
      return ALIAS_REASON;
    case "conversion":
      return CONVERSION_REASON;
  }
}
