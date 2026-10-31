import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { REPO_COURSE_ROOT, repoCourse } from "./course";

// Layer 2 of the leak defence (design 7.2): forbidden fragments are taken from the grader material of
// the repository's course/ (files under checks/ and starter/, quiz.yaml, and the check and workspace
// fields of lesson.yaml), minus anything the learner is meant to see. A served body containing one of them
// means grader material reached the browser.

/** A fragment is a maximal run of these characters, trimmed, at least FRAGMENT_LENGTH long. */
const FRAGMENT_RUN = /[\p{L}\p{N} ,.:/_-]{24,}/gu;
const FRAGMENT_LENGTH = 24;
/** Smaller grader files are left to the image check's name scan (C4); their runs are too generic. */
const MIN_GRADER_FILE_BYTES = 64;
const CHECK_FIELDS = ["run", "title", "file", "rubric", "task", "verify", "answers"];

/**
 * Fragments that also occur in correct output, each with the reason. A new entry needs the judges'
 * agreement (design 7.2).
 */
export const KNOWN_COLLISIONS: ReadonlyMap<string, string> = new Map([
  [
    "abcdefghijklmnopqrstuvwxyz0123456789",
    "a generic id alphabet in 00-introduction/02-agent-loop/checks/test_harness.py that Next's server output also contains",
  ],
]);

export function fragmentsOf(text: string): string[] {
  const fragments: string[] = [];
  for (const match of text.matchAll(FRAGMENT_RUN)) {
    const fragment = match[0].trim();
    if (fragment.length >= FRAGMENT_LENGTH) fragments.push(fragment);
  }
  return fragments;
}

function isGraderPath(rel: string): boolean {
  const segments = rel.split(path.sep);
  return (
    segments.includes("checks") || segments.includes("starter") || segments.at(-1) === "quiz.yaml"
  );
}

async function graderFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => isGraderPath(path.relative(dir, file)));
}

function stringsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(stringsOf);
  return [];
}

/** A lesson without one of its Markdown files (allowed for a planned lesson) contributes nothing. */
async function readOptional(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
    throw error;
  }
}

export interface ForbiddenFragments {
  fragments: string[];
  /** Per lesson id, the fragments of its theory.md: the positive control of the scan. */
  theoryFragments: Map<string, string[]>;
}

export async function forbiddenFragments(): Promise<ForbiddenFragments> {
  const tree = await repoCourse();
  const forbidden = new Set<string>();
  for (const file of await graderFiles(REPO_COURSE_ROOT)) {
    const bytes = await readFile(file);
    if (bytes.length < MIN_GRADER_FILE_BYTES) continue;
    for (const fragment of fragmentsOf(bytes.toString("utf8"))) forbidden.add(fragment);
  }
  const allowed: string[] = [tree.id, tree.title, tree.description];
  const theoryFragments = new Map<string, string[]>();
  for (const module of tree.modules) {
    const { id, title, summary, outcomes } = module.module;
    allowed.push(id, title, summary, ...outcomes);
    for (const node of module.lessons) {
      const { lesson } = node;
      for (const check of lesson.checks) {
        for (const [key, value] of Object.entries(check)) {
          if (!CHECK_FIELDS.includes(key)) continue;
          for (const text of stringsOf(value)) for (const f of fragmentsOf(text)) forbidden.add(f);
        }
      }
      for (const fragment of fragmentsOf(JSON.stringify(lesson.workspace ?? null))) {
        forbidden.add(fragment);
      }
      allowed.push(lesson.id, lesson.title, ...lesson.outcomes);
      for (const source of lesson.sources) allowed.push(source.title, source.url, source.checkedAt);
      const lessonDir = path.join(REPO_COURSE_ROOT, node.dir);
      const theory = await readOptional(path.join(lessonDir, "theory.md"));
      allowed.push(theory, await readOptional(path.join(lessonDir, "task.md")));
      theoryFragments.set(lesson.id, fragmentsOf(theory));
    }
  }
  const corpus = allowed.join("\n");
  const fragments = [...forbidden].filter(
    (fragment) => !corpus.includes(fragment) && !KNOWN_COLLISIONS.has(fragment),
  );
  return { fragments, theoryFragments };
}

/** Finds every fragment in a body by a 24-character prefix index (design 7.2: one pass per body). */
export class FragmentScanner {
  private readonly byPrefix = new Map<string, string[]>();

  constructor(fragments: string[]) {
    for (const fragment of fragments) {
      const prefix = fragment.slice(0, FRAGMENT_LENGTH);
      const bucket = this.byPrefix.get(prefix);
      if (bucket === undefined) this.byPrefix.set(prefix, [fragment]);
      else bucket.push(fragment);
    }
  }

  scan(body: string): Set<string> {
    const hits = new Set<string>();
    for (let index = 0; index + FRAGMENT_LENGTH <= body.length; index += 1) {
      const candidates = this.byPrefix.get(body.slice(index, index + FRAGMENT_LENGTH));
      if (candidates === undefined) continue;
      for (const fragment of candidates) if (body.startsWith(fragment, index)) hits.add(fragment);
    }
    return hits;
  }
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
