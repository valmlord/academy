import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readEveryCourse } from "../lib/course/courses";
import {
  CourseExportError,
  CourseFileError,
  CourseReadError,
  type CourseRootReadError,
} from "../lib/course/errors";
import { learnerFiles } from "../lib/course/files";
import { nodeCourseFs } from "../lib/course/node-fs";
import type { CourseTree } from "../lib/course/read";

// The image build's copy of the learner-visible files of every course (ADR-0009 items 1-2):
//   tsx scripts/export-course.ts export <src> <dest>  copies them under <dest>, keeping relative paths;
//   tsx scripts/export-course.ts list <src>           prints the relative paths export would copy.
// Both read through the same allowlisting file layer as the server. A listed theory.md or task.md that
// does not exist is skipped (a draft lesson has no task.md); any other refusal fails that course. Every
// failing course is reported, then the script exits 1 and copies or prints nothing.

const USAGE = "usage: export-course.ts export <src> <dest> | list <src>";

type Exportable =
  | { kind: "files"; files: Map<string, string> }
  | { kind: "failures"; failures: (CourseReadError | CourseRootReadError)[] };

async function courseFiles(
  src: string,
  tree: CourseTree,
  files: Map<string, string>,
): Promise<void> {
  for (const rel of learnerFiles(tree)) {
    try {
      files.set(rel, await nodeCourseFs.readText(src, rel));
    } catch (error) {
      if (error instanceof CourseFileError && error.reason === "missing" && rel.endsWith(".md")) {
        continue;
      }
      throw error;
    }
  }
}

async function exportableFiles(src: string): Promise<Exportable> {
  const every = await readEveryCourse({ fs: nodeCourseFs, root: () => src });
  if (every.kind === "root-failure") return { kind: "failures", failures: [every.error] };
  const files = new Map<string, string>();
  const failures: CourseReadError[] = [];
  for (const course of every.courses) {
    if (course.kind === "course-failure") {
      failures.push(course.error);
      continue;
    }
    try {
      await courseFiles(src, course.tree, files);
    } catch (error) {
      if (!(error instanceof CourseFileError)) throw error;
      failures.push(new CourseReadError(course.tree.dir, error.file, error.reason));
    }
  }
  return failures.length === 0 ? { kind: "files", files } : { kind: "failures", failures };
}

async function exportTo(dest: string, files: Map<string, string>): Promise<void> {
  for (const [rel, text] of files) {
    const target = path.join(dest, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, src, dest] = argv;
  if (src === undefined || !(command === "list" || (command === "export" && dest !== undefined))) {
    console.error(USAGE);
    return 2;
  }
  const exportable = await exportableFiles(path.resolve(src));
  if (exportable.kind === "failures") {
    for (const failure of exportable.failures) {
      // The message names the course, the relative file and a closed reason only (ADR-0009 item 7).
      const error = new CourseExportError(failure);
      console.error(`export-course: ${error.name}: ${error.message}`);
    }
    return 1;
  }
  const { files } = exportable;
  if (command === "list") {
    for (const rel of [...files.keys()].sort()) console.log(rel);
    return 0;
  }
  await exportTo(path.resolve(dest ?? ""), files);
  console.error(`export-course: copied ${files.size} files`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
