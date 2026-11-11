import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Lesson } from "../src/schema.js";
import { validateCourses } from "../src/validate.js";

let root: string;
function write(rel: string, content: string) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

const M = "c/01-intro";
const L = `${M}/01-agents-md`;

/** A minimal valid ready course with one practice lesson. */
function validCourse() {
  root = mkdtempSync(join(tmpdir(), "lesson-schema-"));
  write("c/course.yaml", "id: c\ntitle: C\ndescription: d\nmodules: [01-intro]\n");
  write(
    `${M}/module.yaml`,
    "id: intro\ntitle: Intro\nsummary: s\nstatus: ready\nlessons: [01-agents-md]\n",
  );
  write(
    `${L}/lesson.yaml`,
    `id: agents-md
title: AGENTS.md
type: agent-eval
outcomes: ["write rules that make the agent avoid generated files"]
estimatedMinutes: 60
status: ready
sources: [{ title: Docs, url: "https://example.com/docs", checkedAt: "2026-10-01" }]
workspace: { starter: starter }
checks:
  - { id: tests, title: Tests pass, kind: command, run: "npm test", timeoutSec: 120 }
  - { id: hidden, title: Hidden task, kind: hidden-task, task: checks/hidden/task.md, verify: checks/hidden/verify.sh, timeoutSec: 600, budgetUsd: 1 }
`,
  );
  write(`${L}/theory.md`, "# Theory\n");
  write(`${L}/task.md`, "# Task\n");
  write(`${L}/starter/README.md`, "starter\n");
  write(`${L}/checks/hidden/task.md`, "hidden\n");
  write(`${L}/checks/hidden/verify.sh`, "exit 0\n");
}

afterEach(() => rmSync(root, { recursive: true, force: true }));

const messages = () =>
  validateCourses(root)
    .issues.map((i) => i.message)
    .join("\n");

describe("validateCourses", () => {
  it("accepts a valid course", () => {
    validCourse();
    const r = validateCourses(root);
    expect(r.issues).toEqual([]);
    expect([r.courses, r.modules, r.lessons]).toEqual([1, 1, 1]);
  });

  it("rejects a missing referenced grader file", () => {
    validCourse();
    rmSync(join(root, `${L}/checks/hidden/verify.sh`));
    expect(messages()).toMatch(/referenced file not found: checks\/hidden\/verify.sh/);
  });

  it("rejects grader files outside checks/", () => {
    validCourse();
    write(`${L}/hidden.md`, "x");
    write(
      `${L}/lesson.yaml`,
      readLesson().replace("task: checks/hidden/task.md", "task: hidden.md"),
    );
    expect(messages()).toMatch(/grader file must live under checks\//);
  });

  it("detects a checks/ leak inside the starter", () => {
    validCourse();
    write(`${L}/starter/checks/verify.sh`, "x");
    expect(messages()).toMatch(/starter contains a checks\/ directory/);
  });

  it("rejects a starter that is the checks/ directory", () => {
    validCourse();
    write(
      `${L}/lesson.yaml`,
      readLesson().replace("workspace: { starter: starter }", "workspace: { starter: checks }"),
    );
    expect(messages()).toMatch(/starter points into checks\//);
  });

  it("detects learner-visible text referencing checks/", () => {
    validCourse();
    write(`${L}/task.md`, "see checks/hidden/task.md");
    expect(messages()).toMatch(/learner-visible file references checks\//);
  });

  it("requires sources for ready lessons", () => {
    validCourse();
    write(`${L}/lesson.yaml`, readLesson().replace(/sources: .*\n/, ""));
    expect(messages()).toMatch(/ready lessons need at least one source/);
  });

  it("requires a workspace for command checks", () => {
    validCourse();
    write(`${L}/lesson.yaml`, readLesson().replace("workspace: { starter: starter }\n", ""));
    expect(messages()).toMatch(/need a workspace/);
  });

  it("flags lesson directories not listed in module.yaml", () => {
    validCourse();
    write(`${M}/02-orphan/lesson.yaml`, "id: orphan\n");
    expect(messages()).toMatch(/not listed in module.yaml/);
  });

  it("flags a ready module with a draft lesson", () => {
    validCourse();
    write(`${L}/lesson.yaml`, readLesson().replace("status: ready", "status: draft"));
    expect(messages()).toMatch(/module is ready but lesson status is draft/);
  });

  it("rejects invalid ids and unknown check kinds", () => {
    validCourse();
    write(
      `${L}/lesson.yaml`,
      readLesson()
        .replace("id: agents-md", "id: Agents MD")
        .replace("kind: command", "kind: magic"),
    );
    const m = messages();
    expect(m).toMatch(/^id: /m);
    expect(m).toMatch(/checks\.0/);
  });

  it("accepts planned modules with no lessons", () => {
    root = mkdtempSync(join(tmpdir(), "lesson-schema-"));
    write("c/course.yaml", "id: c\ntitle: C\ndescription: d\nmodules: [01-intro]\n");
    write(`${M}/module.yaml`, "id: intro\ntitle: Intro\nsummary: s\nstatus: planned\n");
    expect(validateCourses(root).issues).toEqual([]);
  });
});

/** Replaces the checks of the fixture lesson with `checksYaml` (block-style list items). */
function withChecks(checksYaml: string) {
  write(`${L}/lesson.yaml`, readLesson().replace(/checks:\n[\s\S]*$/, `checks:\n${checksYaml}`));
}

/** Turns the fixture module and lesson into drafts. */
function asDraft() {
  write(
    `${M}/module.yaml`,
    readFileSync(join(root, `${M}/module.yaml`), "utf8").replace("status: ready", "status: draft"),
  );
  write(`${L}/lesson.yaml`, readLesson().replace("status: ready", "status: draft"));
}

const issueMessages = () => validateCourses(root).issues.map((i) => i.message);

const commandCheck = (attempts: string) => `  - id: tests
    title: Tests pass
    kind: command
    run: "npm test"
    timeoutSec: 120
${attempts}`;

const quizCheck = (attempts: string) => `  - id: q
    title: Quiz
    kind: quiz
    file: quiz.yaml
    passScore: 0.8
${attempts}`;

const bugHuntCheck = (attempts: string) => `  - id: hunt
    title: Bug hunt
    kind: bug-hunt
    answers: checks/answers.yaml
    minFound: 2
${attempts}`;

const limitBlock = (limit: number) => `    attempts:\n      limit: ${limit}\n`;

const baseLesson = {
  id: "agents-md",
  title: "AGENTS.md",
  type: "agent-eval",
  outcomes: ["o"],
  estimatedMinutes: 60,
  status: "ready",
  sources: [{ title: "Docs", url: "https://example.com/docs", checkedAt: "2026-10-01" }],
  workspace: { starter: "starter" },
};

describe("check attempts", () => {
  it("accepts checks without attempts on a ready command check and on a draft quiz", () => {
    validCourse();
    expect(validateCourses(root).issues).toEqual([]);
    asDraft();
    write(`${L}/quiz.yaml`, "q: 1\n");

    withChecks(quizCheck(""));

    expect(validateCourses(root).issues).toEqual([]);
  });

  it("keeps limit and mentorAfter when it parses a check", () => {
    const lesson = {
      ...baseLesson,
      checks: [
        {
          id: "tests",
          title: "Tests",
          kind: "command",
          run: "npm test",
          timeoutSec: 120,
          attempts: { limit: 10, mentorAfter: 5 },
        },
      ],
    };

    const parsed = Lesson.parse(lesson);

    expect(parsed.checks[0]?.attempts).toEqual({ limit: 10, mentorAfter: 5 });
  });

  it("rejects a limit that is not a positive integer", () => {
    validCourse();
    for (const limit of ["0", "2.5"]) {
      withChecks(commandCheck(`    attempts:\n      limit: ${limit}\n`));

      expect(messages()).toMatch(/^checks\.0\.attempts\.limit: /m);
    }
  });

  it("rejects mentorAfter equal to or above limit and names the check", () => {
    validCourse();
    for (const [mentorAfter, limit] of [
      [5, 5],
      [6, 5],
    ]) {
      withChecks(
        commandCheck(`    attempts:\n      limit: ${limit}\n      mentorAfter: ${mentorAfter}\n`),
      );

      expect(issueMessages()).toEqual([
        `checks.0.attempts.mentorAfter: check "tests": mentorAfter (${mentorAfter}) must be below limit (${limit}), the check closes at its limit`,
      ]);
    }
  });

  it("accepts mentorAfter without a limit on a ready command check", () => {
    validCourse();

    withChecks(commandCheck("    attempts:\n      mentorAfter: 5\n"));

    expect(validateCourses(root).issues).toEqual([]);
  });

  it("rejects an unknown key inside attempts", () => {
    validCourse();

    withChecks(commandCheck("    attempts:\n      maxFaild: 3\n"));

    expect(messages()).toMatch(/checks\.0\.attempts: Unrecognized key: "maxFaild"/);
  });

  it("accepts an empty attempts block as no limit and no threshold", () => {
    validCourse();

    withChecks(commandCheck("    attempts: {}\n"));

    expect(validateCourses(root).issues).toEqual([]);
    const lesson = {
      ...baseLesson,
      checks: [{ id: "tests", title: "T", kind: "command", run: "x", timeoutSec: 1, attempts: {} }],
    };
    expect(Lesson.parse(lesson).checks[0]?.attempts).toEqual({});
  });

  it("requires attempts.limit on ready quiz and bug-hunt checks", () => {
    validCourse();
    write(`${L}/quiz.yaml`, "q: 1\n");
    write(`${L}/checks/answers.yaml`, "a: 1\n");
    const fixtureChecks = readLesson().replace(/^[\s\S]*checks:\n/, "");
    const cases = [
      { check: quizCheck, id: "q", kind: "quiz" },
      { check: bugHuntCheck, id: "hunt", kind: "bug-hunt" },
    ];
    for (const { check, id, kind } of cases) {
      withChecks(`${fixtureChecks}${check("    attempts:\n      mentorAfter: 2\n")}`);

      expect(issueMessages()).toEqual([
        `checks.2.attempts: check "${id}" (${kind}): ready lessons need attempts.limit for quiz and bug-hunt checks`,
      ]);
    }
  });

  it("accepts a draft quiz without attempts.limit in a draft module", () => {
    validCourse();
    asDraft();
    write(`${L}/quiz.yaml`, "q: 1\n");

    withChecks(quizCheck(""));

    expect(validateCourses(root).issues).toEqual([]);
  });

  it("caps the limit of ready quiz and bug-hunt checks at 3", () => {
    validCourse();
    write(`${L}/quiz.yaml`, "q: 1\n");
    write(`${L}/checks/answers.yaml`, "a: 1\n");
    const cases = [
      { check: quizCheck, id: "q", kind: "quiz" },
      { check: bugHuntCheck, id: "hunt", kind: "bug-hunt" },
    ];
    for (const { check, id, kind } of cases) {
      withChecks(check(limitBlock(3)));
      expect(validateCourses(root).issues).toEqual([]);

      withChecks(check(limitBlock(4)));
      expect(issueMessages()).toEqual([
        `checks.0.attempts.limit: check "${id}" (${kind}): attempts.limit (4) is above 3, the most scored submissions a quiz or bug-hunt may allow (ADR-0001 item 8)`,
      ]);
    }
  });

  it("does not cap the limit of a command check", () => {
    validCourse();

    withChecks(commandCheck(limitBlock(10)));

    expect(validateCourses(root).issues).toEqual([]);
  });
});

const COMMAND_KEYS = "attempts, id, kind, run, timeoutSec, title, weight";
const QUIZ_KEYS = "attempts, file, id, kind, passScore, title, weight";
const misspelledBlock = (limit: number) => `    attempt:\n      limit: ${limit}\n`;

describe("unknown check keys in ready lessons", () => {
  it("reports a misspelled attempts block on a ready command check", () => {
    validCourse();

    withChecks(commandCheck(misspelledBlock(10)));

    expect(issueMessages()).toEqual([
      `checks.0: check "tests" (command) has unknown key "attempt"; known keys: ${COMMAND_KEYS}`,
    ]);
  });

  it("reports nothing for a check of every kind that uses only its own keys", () => {
    validCourse();
    write(`${L}/quiz.yaml`, "q: 1\n");
    write(`${L}/checks/rubric.md`, "rubric\n");
    write(`${L}/checks/answers.yaml`, "a: 1\n");

    withChecks(`${quizCheck(limitBlock(3))}${commandCheck(limitBlock(10))}  - id: review
    title: Review
    kind: rubric
    rubric: checks/rubric.md
    artifacts: [plan.md]
    passScore: 0.7
    attempts:
      mentorAfter: 5
  - id: hidden
    title: Hidden task
    kind: hidden-task
    task: checks/hidden/task.md
    verify: checks/hidden/verify.sh
    timeoutSec: 600
    budgetUsd: 1
    attempts: {}
${bugHuntCheck(limitBlock(2))}`);

    expect(validateCourses(root).issues).toEqual([]);
  });

  it("does not report unknown check keys in a draft lesson", () => {
    validCourse();
    asDraft();

    withChecks(commandCheck(misspelledBlock(10)));

    expect(validateCourses(root).issues).toEqual([]);
  });

  it("checks keys against the member of the check's own kind", () => {
    validCourse();
    write(`${L}/quiz.yaml`, "q: 1\n");

    withChecks(quizCheck(`${limitBlock(3)}    run: "pytest"\n`));

    expect(issueMessages()).toEqual([
      `checks.0: check "q" (quiz) has unknown key "run"; known keys: ${QUIZ_KEYS}`,
    ]);
  });

  it("reports unknown check keys when the lesson also fails schema validation", () => {
    validCourse();
    write(`${L}/quiz.yaml`, "q: 1\n");

    withChecks(quizCheck(misspelledBlock(3)));

    expect(issueMessages()).toEqual([
      `checks.0: check "q" (quiz) has unknown key "attempt"; known keys: ${QUIZ_KEYS}`,
      'checks.0.attempts: check "q" (quiz): ready lessons need attempts.limit for quiz and bug-hunt checks',
    ]);
  });

  it("reports checks whose keys it cannot compare instead of skipping them", () => {
    validCourse();
    const cases = [
      {
        checks: "checks:\n  - { id: q, title: Q, kind: quizz }\n",
        message:
          'checks.0: check "q" has kind "quizz", which no check kind defines; its keys were not checked',
      },
      {
        checks: "checks:\n  - { id: q, title: Q }\n",
        message: 'checks.0: check "q" has no kind; its keys were not checked',
      },
      {
        checks: "checks:\n  - { id: q, title: Q, kind: &k [*k] }\n",
        message:
          'checks.0: check "q" has kind of type object, which no check kind defines; its keys were not checked',
      },
      {
        checks: "checks:\n  - tests\n",
        message: "checks.0: not a check object; its keys were not checked",
      },
      { checks: 'checks: "none"\n', message: "checks: not a list; check keys were not checked" },
      { checks: "checks:\n", message: "checks: not a list; check keys were not checked" },
    ];
    for (const { checks, message } of cases) {
      write(`${L}/lesson.yaml`, readLesson().replace(/checks:[\s\S]*$/, checks));

      expect(issueMessages()).toContain(message);
    }
  });

  it("treats an absent checks key as the empty list, as the schema default does", () => {
    validCourse();
    const withoutChecks = readLesson().replace(/checks:\n[\s\S]*$/, "");

    write(`${L}/lesson.yaml`, withoutChecks.replace("type: agent-eval", "type: theory"));
    expect(validateCourses(root).issues).toEqual([]);

    write(`${L}/lesson.yaml`, withoutChecks.replace("type: agent-eval", "type: quiz"));
    expect(issueMessages()).toEqual(["checks: ready practice lessons need checks"]);
  });
});

/** A ready theory lesson of 7 lines, so a line appended to it is line 8. */
const THEORY_LESSON = `id: agents-md
title: AGENTS.md
type: theory
outcomes: ["o"]
estimatedMinutes: 60
status: ready
sources: [{ title: Docs, url: "https://example.com/docs", checkedAt: "2026-10-01" }]
`;

describe("YAML the runtime loaders reject", () => {
  it("reports an unresolved tag in course.yaml and skips its modules", () => {
    validCourse();
    write(
      "c/course.yaml",
      "id: c\ntitle: C\ndescription: d\nmodules: [01-intro]\nextra: !foo bar\n",
    );

    const r = validateCourses(root);

    expect(r.issues).toEqual([
      { file: "c/course.yaml", message: "invalid YAML at line 5 (TAG_RESOLVE_FAILED)" },
    ]);
    expect([r.courses, r.modules, r.lessons]).toEqual([1, 0, 0]);
  });

  it("reports a duplicate key in module.yaml and still validates the next module", () => {
    validCourse();
    write("c/course.yaml", "id: c\ntitle: C\ndescription: d\nmodules: [01-intro, 02-next]\n");
    write("c/02-next/module.yaml", "id: next\ntitle: Next\nsummary: s\nstatus: planned\n");
    write(
      `${M}/module.yaml`,
      "id: intro\ntitle: Intro\nsummary: s\nstatus: ready\nlessons: [01-agents-md]\ntitle: Again\n",
    );

    const r = validateCourses(root);

    expect(r.issues).toEqual([
      { file: `${M}/module.yaml`, message: "invalid YAML at line 6 (DUPLICATE_KEY)" },
    ]);
    expect([r.courses, r.modules, r.lessons]).toEqual([1, 2, 0]);
  });

  it("reports a second YAML document in lesson.yaml without checking its check keys", () => {
    validCourse();
    const misspelled = readLesson().replace("timeoutSec: 120 }", "timeoutSec: 120, attempt: 3 }");
    write(`${L}/lesson.yaml`, `${misspelled}---\nid: other\n`);

    const r = validateCourses(root);

    expect(r.issues).toEqual([
      { file: `${L}/lesson.yaml`, message: "invalid YAML at line 12 (MULTIPLE_DOCS)" },
    ]);
    expect([r.courses, r.modules, r.lessons]).toEqual([1, 1, 1]);
  });

  it("reports a YAML syntax error in lesson.yaml at the line the parser stops", () => {
    validCourse();
    write(`${L}/lesson.yaml`, `${THEORY_LESSON}run: [unclosed\n`);

    const r = validateCourses(root);

    expect(r.issues).toEqual([
      { file: `${L}/lesson.yaml`, message: "invalid YAML at line 9 (BAD_INDENT)" },
    ]);
    expect([r.courses, r.modules, r.lessons]).toEqual([1, 1, 1]);
  });

  it("reports an unresolved alias in lesson.yaml without a line number", () => {
    validCourse();
    write(`${L}/lesson.yaml`, `${THEORY_LESSON}extra: *nope\n`);

    const r = validateCourses(root);

    expect(r.issues).toEqual([
      {
        file: `${L}/lesson.yaml`,
        message: "invalid YAML: alias cannot be resolved (unknown anchor or too many aliases)",
      },
    ]);
    expect([r.courses, r.modules, r.lessons]).toEqual([1, 1, 1]);
  });

  it("still validates the next lesson after a lesson.yaml with a YAML warning", () => {
    validCourse();
    write(
      `${M}/module.yaml`,
      "id: intro\ntitle: Intro\nsummary: s\nstatus: ready\nlessons: [01-agents-md, 02-missing]\n",
    );
    write(`${L}/lesson.yaml`, `${readLesson()}extra: !foo bar\n`);

    const r = validateCourses(root);

    expect(r.issues).toEqual([
      { file: `${L}/lesson.yaml`, message: "invalid YAML at line 12 (TAG_RESOLVE_FAILED)" },
      {
        file: `${M}/02-missing`,
        message: "lesson listed in module.yaml but lesson.yaml is missing",
      },
    ]);
    expect([r.courses, r.modules, r.lessons]).toEqual([1, 1, 1]);
  });
});

function replaceWithDirectory(rel: string): void {
  const p = join(root, rel);
  rmSync(p);
  mkdirSync(p);
}

describe("files that cannot be read", () => {
  it("reports a lesson.yaml that is a directory and counts the lesson", () => {
    validCourse();
    replaceWithDirectory(`${L}/lesson.yaml`);

    const r = validateCourses(root);

    expect(r.issues).toEqual([{ file: `${L}/lesson.yaml`, message: "unreadable (EISDIR)" }]);
    expect([r.courses, r.modules, r.lessons]).toEqual([1, 1, 1]);
  });

  it("reports a course.yaml that is a directory and skips its modules", () => {
    validCourse();
    replaceWithDirectory("c/course.yaml");

    const r = validateCourses(root);

    expect(r.issues).toEqual([{ file: "c/course.yaml", message: "unreadable (EISDIR)" }]);
    expect([r.courses, r.modules, r.lessons]).toEqual([1, 0, 0]);
  });

  it("reports an unreadable lesson.yaml by errno code without the absolute path", () => {
    // Root reads a mode-000 file, so the case would prove nothing: fail rather than skip.
    expect(process.getuid?.()).not.toBe(0);
    validCourse();
    chmodSync(join(root, `${L}/lesson.yaml`), 0o000);

    const r = validateCourses(root);

    expect(r.issues).toEqual([{ file: `${L}/lesson.yaml`, message: "unreadable (EACCES)" }]);
    expect([r.courses, r.modules, r.lessons]).toEqual([1, 1, 1]);
    expect(JSON.stringify(r.issues)).not.toContain(root);
  });

  it("reports unreadable theory.md and task.md and keeps checking the lesson", () => {
    // Root reads a mode-000 file, so the case would prove nothing: fail rather than skip.
    expect(process.getuid?.()).not.toBe(0);
    validCourse();
    replaceWithDirectory(`${L}/theory.md`);
    chmodSync(join(root, `${L}/task.md`), 0o000);

    const r = validateCourses(root);

    expect(r.issues).toEqual([
      { file: `${L}/theory.md`, message: "unreadable (EISDIR)" },
      { file: `${L}/task.md`, message: "unreadable (EACCES)" },
    ]);
    expect([r.courses, r.modules, r.lessons]).toEqual([1, 1, 1]);
  });
});

function readLesson() {
  return readFileSync(join(root, `${L}/lesson.yaml`), "utf8");
}
