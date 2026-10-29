#!/usr/bin/env node
import { resolve } from "node:path";
import { validateCourses } from "./validate.js";

const arg = process.argv.slice(2).find((a) => a !== "--");
const root = resolve(arg ?? "course");
const r = validateCourses(root);
for (const i of r.issues) console.error(`  ${i.file}: ${i.message}`);
console.log(
  `content: ${r.courses} course(s), ${r.modules} module(s), ${r.lessons} lesson(s), ${r.issues.length} issue(s)`,
);
process.exit(r.issues.length === 0 ? 0 : 1);
