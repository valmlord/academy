import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import type { z } from "zod";
import { Course, HIDDEN_DIR, Lesson, Module, REQUIRED_LESSON_FILES } from "./schema.js";

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

function readYaml(file: string): unknown {
  return parse(readFileSync(file, "utf8"));
}

function zodIssues(file: string, err: z.ZodError): ValidationIssue[] {
  return err.issues.map((i) => ({
    file,
    message: `${i.path.join(".") || "(root)"}: ${i.message}`,
  }));
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
    const course = Course.safeParse(readYaml(courseFile));
    result.courses++;
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
      const mod = Module.safeParse(readYaml(modFile));
      result.modules++;
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
        const lesson = Lesson.safeParse(readYaml(lessonFile));
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
