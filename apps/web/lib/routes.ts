// The course routes, built in one place for the top bar, the pages and the e2e specs. A plain module:
// a function exported from a "use client" file reaches a server component as a client reference, not a
// function. Ids are slugs (lesson-schema), so they need no encoding. The pages also build sign-in return
// paths from route params, which Next hands over still percent-encoded (`/courses/a%3Fb` gives `a%3Fb`), so
// such a path is valid as it stands; encoding it again would double every escape.

export function catalogPath(courseId: string): string {
  return `/courses/${courseId}`;
}

export function moduleAnchorPath(courseId: string, moduleId: string): string {
  return `${catalogPath(courseId)}#${moduleId}`;
}

export function lessonPath(courseId: string, lessonId: string): string {
  return `${catalogPath(courseId)}/lessons/${lessonId}`;
}
