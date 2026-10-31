// Prints every file under <repo>/course/ that a Next.js trace file (.nft.json) under apps/web/.next lists,
// then "nft files read: <n>" on stderr. Used by check-build-course.sh (ADR-0009, layer 4).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const [nextDir, courseDir] = process.argv.slice(2).map((arg) => path.resolve(arg));
const coursePrefix = `${courseDir}${path.sep}`;
let read = 0;
for (const entry of readdirSync(nextDir, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".nft.json")) continue;
  const file = path.join(entry.parentPath, entry.name);
  const trace = JSON.parse(readFileSync(file, "utf8"));
  read += 1;
  for (const listed of trace.files ?? []) {
    const absolute = path.resolve(path.dirname(file), listed);
    if (absolute.startsWith(coursePrefix))
      console.log(`${path.relative(nextDir, file)}: ${absolute}`);
  }
}
console.error(`nft files read: ${read}`);
