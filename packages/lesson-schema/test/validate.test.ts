import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function readLesson() {
  return readFileSync(join(root, `${L}/lesson.yaml`), "utf8");
}
