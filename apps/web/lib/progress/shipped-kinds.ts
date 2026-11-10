import type { Check } from "@academy/lesson-schema/schema";

export type CheckKind = Check["kind"];

/**
 * The check kinds whose runner has shipped, so their checks are counted (ADR-0007 as amended by #101,
 * rule 1). Each runner issue (#36 quiz, #37 rubric, #39 hidden-task, the bug-hunt issue) adds its kind
 * in its own PR: a kind listed before its runner exists would be counted but never run, so its
 * lessons could never complete. Code, not an env var, because shipping a runner is a code change and a
 * variable could declare a kind counted with no runner in the image.
 */
export const SHIPPED_CHECK_KINDS: ReadonlySet<CheckKind> = new Set<CheckKind>(["command"]);

/**
 * Per-kind facts the panel needs before a run. A Record over the union, so a new kind in the lesson
 * contract is a type error here until someone decides its traits.
 */
export const CHECK_KIND_TRAITS: Readonly<Record<CheckKind, { spendsTokens: boolean }>> = {
  quiz: { spendsTokens: false },
  command: { spendsTokens: false },
  rubric: { spendsTokens: true },
  "hidden-task": { spendsTokens: true },
  "bug-hunt": { spendsTokens: false },
};
