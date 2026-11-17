import { courseYamlReason, parseCourseYaml } from "@academy/lesson-schema/yaml";
import { CourseFileError } from "./errors";

/**
 * The parsed value of a course YAML file, or a CourseFileError with the reason `@academy/lesson-schema/yaml` gives
 * (ADR-0009 item 7). Nothing from the library's error is attached.
 */
export function parseYamlFile(text: string, file: string): unknown {
  const parsed = parseCourseYaml(text);
  if (parsed.kind !== "value") throw new CourseFileError(file, courseYamlReason(parsed));
  return parsed.value;
}
