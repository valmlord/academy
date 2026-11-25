import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_ROOT = fileURLToPath(new URL("../fixtures/course", import.meta.url));

/**
 * A fresh temporary root holding the fixture's `sample-course` and a copy of it as `other-course`, so both
 * courses have the lesson ids `with-workspace` and `theory-only`. The caller removes it.
 */
export async function twoCourseRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "wks-courses-"));
  await cp(FIXTURE_ROOT, root, { recursive: true });
  await cp(join(root, "sample-course"), join(root, "other-course"), { recursive: true });
  await writeFile(
    join(root, "other-course/course.yaml"),
    "id: other-course\ntitle: Other course\ndescription: A second course.\nmodules:\n  - 01-basics\n",
  );
  return root;
}
