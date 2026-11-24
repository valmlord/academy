import {
  type Dirent,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  type Stats,
  statSync,
} from "node:fs";
import { join, relative } from "node:path";
import type { z } from "zod";
import {
  Check,
  Course,
  HIDDEN_DIR,
  Lesson,
  Module,
  REQUIRED_LESSON_FILES,
  requiredCorrect,
} from "./schema.js";
import { type QuizThresholdStatement, quizThresholdStatements } from "./task-threshold.js";
import { courseYamlReason, parseCourseYaml } from "./yaml.js";

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

type TextRead =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: string };

// Node's own non-fs errors (ERR_*) also carry a string code; the underscore keeps them out.
const ERRNO_CODE = /^E[A-Z0-9]+$/;

/**
 * `unreadable (<errno code>)` for a read that failed with an errno, the reason ADR-0009 item 7 gives a
 * file that exists but cannot be read. An error without an errno code is not a file state item 7 names,
 * so this returns undefined and the caller rethrows it. Only the code is used: the message can hold the
 * absolute path.
 */
function readFailureReason(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const { code } = error;
  if (typeof code !== "string" || !ERRNO_CODE.test(code)) return undefined;
  return `unreadable (${code})`;
}

function readText(file: string): TextRead {
  try {
    return { ok: true, text: readFileSync(file, "utf8") };
  } catch (error: unknown) {
    const reason = readFailureReason(error);
    if (reason === undefined) throw error;
    return { ok: false, reason };
  }
}

/**
 * Reads a course YAML file and parses it with the loaders' rules (./yaml.ts, ADR-0009 item 7), so
 * content:validate does not pass YAML they reject. A file that cannot be read gives `unreadable (<errno code>)`;
 * a parse failure gives the loaders' reason with the library's code appended, `invalid YAML at line <n> (<code>)`;
 * an alias or a conversion failure gives the loaders' reason for it, unchanged and without a line. No reason it
 * returns carries the system error's message (it can hold the absolute path), the library's message or any file
 * text. What propagates is not an author error the rules name: a read error without an errno code, and whatever
 * parseDocument itself throws.
 */
function readYaml(file: string): YamlRead {
  const read = readText(file);
  if (!read.ok) return read;
  const parsed = parseCourseYaml(read.text);
  switch (parsed.kind) {
    case "value":
      return { ok: true, value: parsed.value };
    case "parse":
      return { ok: false, reason: `${courseYamlReason(parsed)} (${parsed.code})` };
    case "alias":
    case "conversion":
      return { ok: false, reason: courseYamlReason(parsed) };
  }
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
 * reported when it also makes the schema check fail. A lesson.yaml that cannot be read or is not valid
 * YAML is reported once with that reason and never reaches this function.
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

type QuizCheck = Extract<Check, { kind: "quiz" }>;

interface QuizQuestions {
  readonly check: QuizCheck;
  // Undefined when the quiz file gives no usable count; no required count is then printed.
  readonly questionCount: number | undefined;
}

type QuestionCountRead =
  | { readonly ok: true; readonly questionCount: number }
  | { readonly ok: false; readonly reason: string | undefined };

/**
 * The question count of a quiz check: the length of its file's top-level `questions` list. A
 * missing file gives no reason, because the referenced-file check already reports it. Nothing else
 * in the file is read: its shape is the quiz server's (#36).
 */
function readQuestionCount(lessonDir: string, check: QuizCheck): QuestionCountRead {
  const file = join(lessonDir, check.file);
  if (!existsSync(file)) return { ok: false, reason: undefined };
  const read = readYaml(file);
  const label = `check "${check.id}" (quiz)`;
  if (!read.ok) {
    return {
      ok: false,
      reason: `${read.reason}; ${label}: question count unknown, so task.md's threshold was not compared`,
    };
  }
  const questions = isRecord(read.value) ? read.value.questions : undefined;
  if (!Array.isArray(questions)) {
    return {
      ok: false,
      reason: `${label}: no top-level "questions" list; question count unknown, so task.md's threshold was not compared`,
    };
  }
  if (questions.length === 0) {
    return {
      ok: false,
      reason: `${label}: "questions" is an empty list, and a quiz needs at least one question; task.md's threshold was not compared`,
    };
  }
  return { ok: true, questionCount: questions.length };
}

function requirementText(check: QuizCheck, questionCount: number): string {
  const correct = requiredCorrect(check.passScore, questionCount);
  return `${check.file} has ${questionCount} questions, and passScore ${String(check.passScore)} requires ${correct} correct`;
}

/**
 * What the quiz file and passScore require, when the stated numbers differ from it. Undefined when
 * they agree, and when the question count is unknown, so no required count is printed without one.
 */
function unmetRequirement(
  quiz: QuizQuestions,
  statedQuestions: number,
  statedCorrect: number,
): string | undefined {
  if (quiz.questionCount === undefined) return undefined;
  const correct = requiredCorrect(quiz.check.passScore, quiz.questionCount);
  if (statedQuestions === quiz.questionCount && statedCorrect === correct) return undefined;
  return requirementText(quiz.check, quiz.questionCount);
}

const THRESHOLD_FORM_EXAMPLES =
  '"`<check id>` (квиз): Q вопросов, нужно K верных." or "Квиз: не меньше K из Q."';

/** Issue messages for one task.md statement, compared with the lesson's quiz checks. */
function statementIssues(
  statement: QuizThresholdStatement,
  quizzes: readonly QuizQuestions[],
): string[] {
  const at = `line ${statement.line}:`;
  const messages: string[] = [];
  if (statement.kind === "unreadable") {
    messages.push(
      `${at} this sentence counts as a quiz threshold statement (it begins "\`<id>\` (квиз):", or it contains "квиз" and a count; see ADR-0001 item 6 and the fixture table it names) but has neither threshold form (for example ${THRESHOLD_FORM_EXAMPLES}), so it was not compared`,
    );
  }
  if (statement.kind === "restated") {
    messages.push(...restatementIssues(statement, quizzes));
    return messages;
  }
  const { checkId } = statement;
  if (checkId === undefined) return messages;
  const quiz = quizzes.find((q) => q.check.id === checkId);
  if (quiz === undefined) {
    const quizIds = quizzes.length === 0 ? "none" : quizzes.map((q) => q.check.id).join(", ");
    messages.push(
      `${at} the sentence names "${checkId}" as a quiz check ("\`${checkId}\` (квиз):"), but "${checkId}" is not a quiz check of lesson.yaml (quiz checks: ${quizIds})`,
    );
    return messages;
  }
  if (statement.kind !== "anchored") return messages;
  const unmet = unmetRequirement(quiz, statement.statedQuestions, statement.statedCorrect);
  if (unmet !== undefined) {
    messages.push(
      `${at} check "${checkId}" (quiz) states ${statement.statedQuestions} questions and ${statement.statedCorrect} correct required; ${unmet}`,
    );
  }
  return messages;
}

/** A restatement names no check, so it is compared only when the lesson has exactly one quiz. */
function restatementIssues(
  statement: Extract<QuizThresholdStatement, { kind: "restated" }>,
  quizzes: readonly QuizQuestions[],
): string[] {
  const at = `line ${statement.line}:`;
  const [quiz, ...otherQuizzes] = quizzes;
  if (quiz === undefined) return [`${at} "Квиз:" restatement, but lesson.yaml has no quiz check`];
  if (otherQuizzes.length > 0) {
    const quizIds = quizzes.map((q) => q.check.id).join(", ");
    return [
      `${at} "Квиз:" restatement names no check, and lesson.yaml has ${quizzes.length} quiz checks (${quizIds}); state each threshold in its "\`<check id>\` (квиз):" sentence`,
    ];
  }
  const unmet = unmetRequirement(quiz, statement.statedQuestions, statement.statedCorrect);
  if (unmet === undefined) return [];
  return [
    `${at} "Квиз:" restatement states ${statement.statedCorrect} correct of ${statement.statedQuestions}; check "${quiz.check.id}" (quiz): ${unmet}`,
  ];
}

function missingSentenceIssue(quiz: QuizQuestions): string {
  const { id } = quiz.check;
  const missing = `check "${id}" (quiz): task.md has no sentence that begins with "\`${id}\` (квиз):", bold or not, the threshold sentence of this check (see ADR-0001 item 6 and the fixture table it names; for example "\`${id}\` (квиз): Q вопросов, нужно K верных.")`;
  if (quiz.questionCount === undefined) return missing;
  return `${missing}; ${requirementText(quiz.check, quiz.questionCount)}`;
}

/**
 * Issues for the quiz thresholds of a ready lesson (ADR-0001 item 6): quiz files without a usable
 * question count (check order), then each task.md statement that disagrees with the server's
 * required count or cannot be read (text order), then each quiz check without its own sentence.
 */
function quizThresholdIssues(
  lessonDir: string,
  lesson: Lesson,
  taskText: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const quizzes: QuizQuestions[] = [];
  for (const check of lesson.checks) {
    if (check.kind !== "quiz") continue;
    const read = readQuestionCount(lessonDir, check);
    if (!read.ok && read.reason !== undefined) {
      issues.push({ file: join(lessonDir, check.file), message: read.reason });
    }
    quizzes.push({ check, questionCount: read.ok ? read.questionCount : undefined });
  }

  const taskFile = join(lessonDir, "task.md");
  const idsWithSentence = new Set<string>();
  for (const statement of quizThresholdStatements(taskText)) {
    // An unreadable sentence that starts with the check's anchor is its sentence, reported once
    // for being unreadable rather than a second time for being missing.
    if (statement.kind !== "restated" && statement.checkId !== undefined) {
      idsWithSentence.add(statement.checkId);
    }
    for (const message of statementIssues(statement, quizzes)) {
      issues.push({ file: taskFile, message });
    }
  }

  for (const quiz of quizzes) {
    if (!idsWithSentence.has(quiz.check.id)) {
      issues.push({ file: taskFile, message: missingSentenceIssue(quiz) });
    }
  }
  return issues;
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

// The root's path relative to itself is empty; "." names it without printing its absolute path.
const ROOT_LABEL = ".";

type RootListing =
  | { readonly ok: true; readonly courseNames: string[]; readonly symlinkNames: string[] }
  | { readonly ok: false; readonly reason: string };

/**
 * The real directories and the symlinks directly under the root, each as a name list in plain-string
 * order. The entry types come from the listing and do not follow links, so a broken symlink is listed,
 * not followed. Other entries are dropped.
 */
function listCourseRoot(root: string): RootListing {
  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error: unknown) {
    const reason = readFailureReason(error);
    if (reason === undefined) throw error;
    return { ok: false, reason };
  }
  const names = (keep: (entry: Dirent) => boolean): string[] =>
    entries
      .filter(keep)
      .map((entry) => entry.name)
      .sort();
  return {
    ok: true,
    courseNames: names((entry) => entry.isDirectory()),
    symlinkNames: names((entry) => entry.isSymbolicLink()),
  };
}

type CourseFileState =
  | { readonly kind: "missing" }
  | { readonly kind: "symlink" }
  | { readonly kind: "unreadable"; readonly reason: string }
  | { readonly kind: "present" };

/** The state of a course.yaml from `lstat`, which does not follow a symlink. */
function courseFileState(file: string): CourseFileState {
  let stats: Stats;
  try {
    stats = lstatSync(file);
  } catch (error: unknown) {
    const reason = readFailureReason(error);
    if (reason === undefined) throw error;
    const isMissing =
      typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
    return isMissing ? { kind: "missing" } : { kind: "unreadable", reason };
  }
  return stats.isSymbolicLink() ? { kind: "symlink" } : { kind: "present" };
}

/** Validates the course root and every course in it (ADR-0009 item 6). */
export function validateCourses(root: string): ValidationResult {
  const result: ValidationResult = { courses: 0, modules: 0, lessons: 0, issues: [] };
  const issue = (file: string, message: string) =>
    result.issues.push({ file: relative(root, file) || ROOT_LABEL, message });

  if (!existsSync(root)) {
    issue(root, "course root does not exist");
    return result;
  }

  const listing = listCourseRoot(root);
  if (!listing.ok) {
    issue(root, `course root cannot be listed: ${listing.reason}`);
    return result;
  }
  for (const name of listing.symlinkNames) {
    issue(root, `symlink ${JSON.stringify(name)} directly under the course root is not a course`);
  }
  if (listing.courseNames.length === 0) {
    issue(root, "no course: the course root holds no directory");
    return result;
  }

  for (const name of listing.courseNames) {
    result.courses++;
    // Checked before any file of the directory is opened.
    const courseId = Course.shape.id.safeParse(name);
    if (!courseId.success) {
      const reason = courseId.error.issues[0]?.message ?? "invalid";
      issue(root, `directory ${JSON.stringify(name)} is not a course id (${reason})`);
      continue;
    }
    const courseDir = join(root, name);
    const courseFile = join(courseDir, "course.yaml");
    const courseFileStatus = courseFileState(courseFile);
    if (courseFileStatus.kind === "missing") {
      issue(courseDir, "missing course.yaml");
      continue;
    }
    if (courseFileStatus.kind === "symlink") {
      issue(courseFile, "course.yaml is a symlink");
      continue;
    }
    if (courseFileStatus.kind === "unreadable") {
      issue(courseFile, courseFileStatus.reason);
      continue;
    }
    const courseRead = readYaml(courseFile);
    if (!courseRead.ok) {
      issue(courseFile, courseRead.reason);
      continue;
    }
    const course = Course.safeParse(courseRead.value);
    if (!course.success) {
      result.issues.push(...zodIssues(relative(root, courseFile), course.error));
      continue;
    }
    // Checked before any module.yaml of the course is read.
    if (course.data.id !== name) {
      issue(
        courseFile,
        `id ${JSON.stringify(course.data.id)} is not the directory name ${JSON.stringify(name)}`,
      );
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
        let taskText: string | undefined;
        for (const visible of ["theory.md", "task.md"]) {
          const p = join(lessonDir, visible);
          if (!existsSync(p)) continue;
          const read = readText(p);
          if (!read.ok) {
            issue(p, read.reason);
            continue;
          }
          if (read.text.includes(`${HIDDEN_DIR}/`)) {
            issue(p, `learner-visible file references ${HIDDEN_DIR}/ (leak)`);
          }
          if (visible === "task.md") taskText = read.text;
        }
        // Ready only: the learner sees no other lesson, and the flip to ready runs this check.
        if (l.status === "ready" && taskText !== undefined) {
          for (const i of quizThresholdIssues(lessonDir, l, taskText)) issue(i.file, i.message);
        }
      }
    }
  }
  return result;
}
