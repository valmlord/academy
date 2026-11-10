/**
 * Lesson contract (ADR-0001). The ONLY definition of the course format.
 * The content team produces files that match it; the platform reads them through it.
 * Changing it requires an ADR update and migrating every lesson under course/.
 */
import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase-kebab-case");
const dirName = z
  .string()
  .regex(/^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/, "NN-kebab-case directory name");
const relPath = z
  .string()
  .min(1)
  .refine(
    (p) => !p.startsWith("/") && !p.split("/").includes(".."),
    "relative path inside the lesson",
  );
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const Status = z.enum(["planned", "draft", "ready"]);
export type Status = z.infer<typeof Status>;

export const Source = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  checkedAt: isoDate,
});

/**
 * Most scored submissions a quiz or bug-hunt check may allow. #15 section 2.5.6 item 6 shows score-only
 * feedback safe only within 3 scored submissions, and every guessing rate in that design is computed for
 * this number, so raising it needs a new analysis and a change of ADR-0001 item 8, not a YAML edit.
 */
export const SCORE_ONLY_SUBMISSION_CAP = 3;

// Strict so that a typo inside the block (`maxFaild`) is an error at every status, never a silent "no cap".
const Attempts = z.strictObject({
  limit: z.number().int().positive().optional(),
  mentorAfter: z.number().int().positive().optional(),
});

const checkBase = {
  id: slug,
  title: z.string().min(1),
  weight: z.number().positive().default(1),
  attempts: Attempts.optional(),
};

export const Check = z.discriminatedUnion("kind", [
  z.object({
    ...checkBase,
    kind: z.literal("quiz"),
    file: relPath,
    passScore: z.number().min(0).max(1),
  }),
  z.object({
    ...checkBase,
    kind: z.literal("command"),
    run: z.string().min(1),
    timeoutSec: z.number().int().positive().max(1800),
  }),
  z.object({
    ...checkBase,
    kind: z.literal("rubric"),
    rubric: relPath,
    artifacts: z.array(z.string().min(1)).min(1),
    passScore: z.number().min(0).max(1),
  }),
  z.object({
    ...checkBase,
    kind: z.literal("hidden-task"),
    task: relPath,
    verify: relPath,
    timeoutSec: z.number().int().positive().max(3600),
    budgetUsd: z.number().positive().max(20),
  }),
  z.object({
    ...checkBase,
    kind: z.literal("bug-hunt"),
    answers: relPath,
    minFound: z.number().int().positive(),
  }),
]);
export type Check = z.infer<typeof Check>;

export const LessonType = z.enum([
  "theory",
  "quiz",
  "artifact",
  "agent-eval",
  "bug-hunt",
  "project",
]);

export const Lesson = z
  .object({
    id: slug,
    title: z.string().min(1),
    type: LessonType,
    outcomes: z.array(z.string().min(1)).min(1),
    estimatedMinutes: z.number().int().positive().max(600),
    status: Status,
    prerequisites: z.array(slug).default([]),
    sources: z.array(Source).default([]),
    workspace: z
      .object({
        image: z.string().min(1).default("academy-workspace:dev"),
        starter: relPath.default("starter"),
      })
      .optional(),
    checks: z.array(Check).default([]),
  })
  .superRefine((l, ctx) => {
    if (l.status === "ready") {
      if (l.sources.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["sources"],
          message: "ready lessons need at least one source",
        });
      }
      if (l.type !== "theory" && l.checks.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["checks"],
          message: "ready practice lessons need checks",
        });
      }
      l.checks.forEach((c, index) => {
        const isScoreOnly = c.kind === "quiz" || c.kind === "bug-hunt";
        if (isScoreOnly && c.attempts?.limit === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["checks", index, "attempts"],
            message: `check "${c.id}" (${c.kind}): ready lessons need attempts.limit for quiz and bug-hunt checks`,
          });
        }
      });
    }
    const needsWorkspace = l.checks.some((c) => c.kind === "command" || c.kind === "hidden-task");
    if (needsWorkspace && !l.workspace) {
      ctx.addIssue({
        code: "custom",
        path: ["workspace"],
        message: "command/hidden-task checks need a workspace",
      });
    }
    l.checks.forEach((c, index) => {
      const limit = c.attempts?.limit;
      const mentorAfter = c.attempts?.mentorAfter;
      if (limit !== undefined && mentorAfter !== undefined && mentorAfter >= limit) {
        ctx.addIssue({
          code: "custom",
          path: ["checks", index, "attempts", "mentorAfter"],
          message: `check "${c.id}": mentorAfter (${mentorAfter}) must be below limit (${limit}), the check closes at its limit`,
        });
      }
      const isScoreOnly = c.kind === "quiz" || c.kind === "bug-hunt";
      if (isScoreOnly && limit !== undefined && limit > SCORE_ONLY_SUBMISSION_CAP) {
        ctx.addIssue({
          code: "custom",
          path: ["checks", index, "attempts", "limit"],
          message: `check "${c.id}" (${c.kind}): attempts.limit (${limit}) is above ${SCORE_ONLY_SUBMISSION_CAP}, the most scored submissions a quiz or bug-hunt may allow (ADR-0001 item 8)`,
        });
      }
    });
    const ids = l.checks.map((c) => c.id);
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dup)
      ctx.addIssue({ code: "custom", path: ["checks"], message: `duplicate check id: ${dup}` });
  });
export type Lesson = z.infer<typeof Lesson>;

export const Module = z.object({
  id: slug,
  title: z.string().min(1),
  summary: z.string().min(1),
  outcomes: z.array(z.string().min(1)).default([]),
  status: Status,
  lessons: z.array(dirName).default([]),
});
export type Module = z.infer<typeof Module>;

export const Course = z.object({
  id: slug,
  title: z.string().min(1),
  description: z.string().min(1),
  modules: z.array(dirName).min(1),
});
export type Course = z.infer<typeof Course>;

/** Files a lesson directory must contain, by status. */
export const REQUIRED_LESSON_FILES: Record<Status, string[]> = {
  planned: ["lesson.yaml"],
  draft: ["lesson.yaml", "theory.md"],
  ready: ["lesson.yaml", "theory.md", "task.md"],
};

/** Directory with grader material. Must never be referenced from the learner-visible side. */
export const HIDDEN_DIR = "checks";
