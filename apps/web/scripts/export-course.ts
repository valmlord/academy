import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CourseExportError, CourseFileError, CourseReadError } from "../lib/course/errors";
import { learnerFiles } from "../lib/course/files";
import { nodeCourseFs } from "../lib/course/node-fs";
import { readCourse } from "../lib/course/read";

// The image build's copy of the learner-visible course files (ADR-0009 items 1-2):
//   tsx scripts/export-course.ts export <src> <dest>  copies them under <dest>, keeping relative paths;
//   tsx scripts/export-course.ts list <src>           prints the relative paths export would copy.
// Both read through the same allowlisting file layer as the server. A listed theory.md or task.md that
// does not exist is skipped (a draft lesson has no task.md); any other refusal stops with exit 1.

const USAGE = "usage: export-course.ts export <src> <dest> | list <src>";

async function exportableFiles(src: string): Promise<Map<string, string>> {
  const tree = await readCourse(nodeCourseFs, src);
  const files = new Map<string, string>();
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
  return files;
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
  const files = await exportableFiles(path.resolve(src));
  if (command === "list") {
    for (const rel of [...files.keys()].sort()) console.log(rel);
    return 0;
  }
  await exportTo(path.resolve(dest ?? ""), files);
  console.error(`export-course: copied ${files.size} files`);
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof CourseFileError || error instanceof CourseReadError)) throw error;
  // The message names the relative file and a closed reason only (ADR-0009 item 7).
  const failure = new CourseExportError(error.file, error.reason);
  console.error(`export-course: ${failure.name}: ${failure.message}`);
  process.exitCode = 1;
}
