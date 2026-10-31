import path from "node:path";
import { CourseReadError } from "./errors";

/**
 * The directory that holds the course. The image sets an absolute `COURSE_ROOT`; unset, `pnpm dev` (cwd
 * apps/web) reads the repository's course/.
 */
export function courseRoot(env: Record<string, string | undefined>, cwd: string): string {
  const configured = env.COURSE_ROOT;
  if (configured === undefined || configured === "") {
    return path.resolve(cwd, "../../course");
  }
  // A relative value would depend on the process's cwd, which differs between dev and the image.
  if (!path.isAbsolute(configured)) {
    throw new CourseReadError("COURSE_ROOT", "must be an absolute path");
  }
  return configured;
}
