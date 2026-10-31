import type { CourseTree } from "./read";

// The only file names the web may open under the course root (ADR-0009 item 2).
export const LEARNER_FILES: readonly string[] = [
  "course.yaml",
  "module.yaml",
  "lesson.yaml",
  "theory.md",
  "task.md",
];

/**
 * Every file the web may serve, derived from the parsed tree only: course.yaml, each listed module.yaml,
 * and lesson.yaml, theory.md, task.md of each listed lesson. The image export copies exactly this list and
 * the server opens nothing else (ADR-0009 item 2).
 */
export function learnerFiles(tree: CourseTree): string[] {
  const files = [`${tree.dir}/course.yaml`];
  for (const module of tree.modules) {
    files.push(`${module.dir}/module.yaml`);
    for (const { dir } of module.lessons) {
      files.push(`${dir}/lesson.yaml`, `${dir}/theory.md`, `${dir}/task.md`);
    }
  }
  return files;
}
