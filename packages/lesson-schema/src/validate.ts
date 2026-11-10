import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { LineCounter, parseDocument } from "yaml";
import type { z } from "zod";
import { Check, Course, HIDDEN_DIR, Lesson, Module, REQUIRED_LESSON_FILES } from "./schema.js";

export interface ValidationIssue {
  file: string;
  message: string;
}

export interface ValidationResult {
  courses: number;
  modules: number;
  lessons: number;
  issues: ValidationIssue[];
}

type YamlRead =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: string };

// toJS() throws a ReferenceError without a position for both alias failures it has at default options,
// so this reason names the two causes and gives no line rather than a guessed one.
const ALIAS_REASON = "invalid YAML: alias cannot be resolved (unknown anchor or too many aliases)";

/**
 * Fails the file closed under ADR-0009 item 7's rules, with the options and the errors-then-warnings
 * order of the web and workspace loaders (the other two copies), so content:validate does not pass YAML
 * that they reject. The reason gives the line and the code, a closed library enum, so neither the
 * library's message nor any file text is printed. A ReferenceError from toJS() is the only shape the
 * library uses for an alias it cannot resolve; anything else is not an author error and propagates.
 */
function readYaml(file: string): YamlRead {
  const text = readFileSync(file, "utf8");
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false, logLevel: "error" });
  const first = doc.errors[0] ?? doc.warnings[0];
  if (first !== undefined) {
    const { line } = lineCounter.linePos(first.pos[0]);
    return { ok: false, reason: `invalid YAML at line ${line} (${first.code})` };
  }
  let value: unknown;
  try {
    value = doc.toJS();
  } catch (error: unknown) {
    if (error instanceof ReferenceError) return { ok: false, reason: ALIAS_REASON };
    throw error;
  }
  return { ok: true, value };
}

function zodIssues(file: string, err: z.ZodError): ValidationIssue[] {
  return err.issues.map((i) => ({
    file,
    message: `${i.path.join(".") || "(root)"}: ${i.message}`,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A raw value can be anything YAML yields, including a self-referencing alias that JSON.stringify
// cannot print, so only scalars are printed verbatim.
function describeRawValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return String(value);
  return `of type ${typeof value}`;
}

function unknownKeysOfCheck(element: unknown, index: number): string[] {
  if (!isRecord(element)) return [`checks.${index}: not a check object; its keys were not checked`];
  const id = typeof element.id === "string" ? element.id : "?";
  const kind = element.kind;
  if (kind === undefined) {
    return [`checks.${index}: check "${id}" has no kind; its keys were not checked`];
  }
  const member = Check.options.find((o) => o.shape.kind.value === kind);
  if (!member) {
    return [
      `checks.${index}: check "${id}" has kind ${describeRawValue(kind)}, which no check kind defines; its keys were not checked`,
    ];
  }
  const known = Object.keys(member.shape).sort();
  return Object.keys(element)
    .filter((key) => !known.includes(key))
    .map(
      (key) =>
        `checks.${index}: check "${id}" (${member.shape.kind.value}) has unknown key "${key}"; known keys: ${known.join(", ")}`,
    );
}

/**
 * Issue messages for the checks of a ready lesson: each key the check's kind does not define, and each
 * check whose keys cannot be compared (not an object, no kind, a kind no check defines, or `checks` not
 * a list). Works on the raw YAML value because zod strips unknown keys from the parsed lesson. The caller
 * runs it before the schema check and whatever that check's outcome, so a misspelled `attempts` is still
 * reported when it also makes the schema check fail. A lesson.yaml that is not valid YAML is reported
 * once with its YAML error and never reaches this function.
 */
function unknownCheckKeys(rawLesson: unknown): string[] {
  if (!isRecord(rawLesson) || rawLesson.status !== "ready") return [];
  const checks = rawLesson.checks;
  // Absent is the empty list, as `checks: z.array(Check).default([])` makes it: a ready theory lesson
  // needs no checks.
  if (checks === undefined) return [];
  if (!Array.isArray(checks)) return ["checks: not a list; check keys were not checked"];
  const elements: readonly unknown[] = checks;
  return elements.flatMap((element, index) => unknownKeysOfCheck(element, index));
}

/** Files under dir. With includeLinks, symlinks are returned (not followed) so callers can reject them. */
function listFiles(dir: string, includeLinks = false): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) {
      if (includeLinks) out.push(p);
    } else if (st.isDirectory()) {
      out.push(...listFiles(p, includeLinks));
    } else {
      out.push(p);
    }
  }
  return out;
}

function subdirs(dir: string): string[] {
  return readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());
}

/** Validate every course under `root` (each subdirectory with a course.yaml). */
export function validateCourses(root: string): ValidationResult {
  const result: ValidationResult = { courses: 0, modules: 0, lessons: 0, issues: [] };
  const issue = (file: string, message: string) =>
    result.issues.push({ file: relative(root, file) || file, message });

  if (!existsSync(root)) {
    issue(root, "course root does not exist");
    return result;
  }

  for (const courseDir of subdirs(root).map((d) => join(root, d))) {
    const courseFile = join(courseDir, "course.yaml");
    if (!existsSync(courseFile)) {
      issue(courseDir, "missing course.yaml");
      continue;
    }
    const courseRead = readYaml(courseFile);
    result.courses++;
    if (!courseRead.ok) {
      issue(courseFile, courseRead.reason);
      continue;
    }
    const course = Course.safeParse(courseRead.value);
    if (!course.success) {
      result.issues.push(...zodIssues(relative(root, courseFile), course.error));
      continue;
    }

    const onDiskModules = subdirs(courseDir);
    for (const extra of onDiskModules.filter((d) => !course.data.modules.includes(d))) {
      issue(join(courseDir, extra), "module directory not listed in course.yaml");
    }

    const lessonIds = new Map<string, string>();
    for (const modName of course.data.modules) {
      const modDir = join(courseDir, modName);
      const modFile = join(modDir, "module.yaml");
      if (!existsSync(modFile)) {
        issue(modDir, "module listed in course.yaml but module.yaml is missing");
        continue;
      }
      const modRead = readYaml(modFile);
      result.modules++;
      if (!modRead.ok) {
        issue(modFile, modRead.reason);
        continue;
      }
      const mod = Module.safeParse(modRead.value);
      if (!mod.success) {
        result.issues.push(...zodIssues(relative(root, modFile), mod.error));
        continue;
      }
      for (const extra of subdirs(modDir).filter((d) => !mod.data.lessons.includes(d))) {
        issue(join(modDir, extra), "lesson directory not listed in module.yaml");
      }

      for (const lessonName of mod.data.lessons) {
        const lessonDir = join(modDir, lessonName);
        const lessonFile = join(lessonDir, "lesson.yaml");
        if (!existsSync(lessonFile)) {
          issue(lessonDir, "lesson listed in module.yaml but lesson.yaml is missing");
          continue;
        }
        const lessonRead = readYaml(lessonFile);
        if (!lessonRead.ok) {
          result.lessons++;
          issue(lessonFile, lessonRead.reason);
          continue;
        }
        for (const message of unknownCheckKeys(lessonRead.value)) issue(lessonFile, message);
        const lesson = Lesson.safeParse(lessonRead.value);
        result.lessons++;
        if (!lesson.success) {
          result.issues.push(...zodIssues(relative(root, lessonFile), lesson.error));
          continue;
        }
        const l = lesson.data;

        const prev = lessonIds.get(l.id);
        if (prev) issue(lessonFile, `duplicate lesson id "${l.id}" (also in ${prev})`);
        lessonIds.set(l.id, relative(root, lessonFile));

        if (mod.data.status === "ready" && l.status !== "ready") {
          issue(lessonFile, `module is ready but lesson status is ${l.status}`);
        }

        for (const f of REQUIRED_LESSON_FILES[l.status]) {
          if (!existsSync(join(lessonDir, f))) issue(lessonDir, `status ${l.status} requires ${f}`);
        }

        const referenced: string[] = [];
        for (const c of l.checks) {
          if (c.kind === "quiz") referenced.push(c.file);
          if (c.kind === "rubric") referenced.push(c.rubric);
          if (c.kind === "hidden-task") referenced.push(c.task, c.verify);
          if (c.kind === "bug-hunt") referenced.push(c.answers);
        }
        for (const f of referenced) {
          if (!existsSync(join(lessonDir, f))) issue(lessonFile, `referenced file not found: ${f}`);
        }
        for (const c of l.checks) {
          const hidden =
            c.kind === "hidden-task"
              ? [c.task, c.verify]
              : c.kind === "bug-hunt"
                ? [c.answers]
                : c.kind === "rubric"
                  ? [c.rubric]
                  : [];
          for (const h of hidden) {
            if (!h.startsWith(`${HIDDEN_DIR}/`))
              issue(lessonFile, `grader file must live under ${HIDDEN_DIR}/: ${h}`);
          }
        }

        // Leak guard: nothing learner-visible may mention or contain the hidden directory.
        for (const f of listFiles(lessonDir, true)) {
          if (lstatSync(f).isSymbolicLink()) issue(f, "symlinks are not allowed in lessons");
        }
        if (l.workspace) {
          const starterDir = join(lessonDir, l.workspace.starter);
          const hiddenDir = join(lessonDir, HIDDEN_DIR);
          if (!existsSync(starterDir)) {
            issue(lessonDir, `workspace starter not found: ${l.workspace.starter}`);
          } else if (existsSync(hiddenDir)) {
            const real = realpathSync(starterDir);
            const hidden = realpathSync(hiddenDir);
            if (real === hidden || real.startsWith(`${hidden}/`)) {
              issue(lessonDir, `workspace starter points into ${HIDDEN_DIR}/ (leak)`);
            }
          }
          for (const f of listFiles(starterDir)) {
            const rel = relative(starterDir, f);
            if (rel.split("/").includes(HIDDEN_DIR))
              issue(f, "starter contains a checks/ directory (leak)");
          }
        }
        for (const visible of ["theory.md", "task.md"]) {
          const p = join(lessonDir, visible);
          if (existsSync(p) && readFileSync(p, "utf8").includes(`${HIDDEN_DIR}/`)) {
            issue(p, `learner-visible file references ${HIDDEN_DIR}/ (leak)`);
          }
        }
      }
    }
  }
  return result;
}
