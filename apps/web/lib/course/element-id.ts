import { isCourseIdForm } from "./courses";

/** The elements of a course's dashboard block that carry an id built from the course id. */
export type CourseElementPart = "heading" | "line" | "error-title";

const utf8 = new TextEncoder();

/**
 * `course-<token>-<part>`. The token is the course id itself when it has the course id form (`isCourseIdForm`);
 * any other directory name becomes `_` followed by the lowercase hex of its UTF-8 bytes, two digits per byte.
 * An id-form token never holds `_` and an encoded one always starts with it, so the two kinds never meet. Every
 * id is made of lowercase ASCII letters, digits, `-` and `_` only, so it needs no escaping in a selector or in
 * an `aria-labelledby` list.
 */
export function courseElementId(courseId: string, part: CourseElementPart): string {
  return `course-${courseToken(courseId)}-${part}`;
}

function courseToken(courseId: string): string {
  if (isCourseIdForm(courseId)) return courseId;
  let hex = "_";
  for (const byte of utf8.encode(courseId)) hex += byte.toString(16).padStart(2, "0");
  return hex;
}
