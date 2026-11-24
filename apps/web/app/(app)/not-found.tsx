import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactElement } from "react";
import { FocusOnAnyRetry } from "@/components/focus-on-mount";
import { Button } from "@/components/ui/button";
import { notFoundSentence, notFoundTitle, openCourseLabel } from "@/lib/copy";
import { getCourseById } from "@/lib/course/server";
import { PATHNAME_HEADER } from "@/lib/next-path";
import { catalogPath, lessonPathCourseId } from "@/lib/routes";
import { getSession } from "@/lib/session";

// Also set by every page that calls notFound(), so the title does not depend on this export.
export const metadata: Metadata = {
  title: notFoundTitle,
};

const TITLE_ID = "not-found-title";

// design/pages/not-found (Status: ready): the app shell with the not-found h1, the one sentence and, for an
// unknown lesson of a readable course, the open-course button link (the F6 landing of `main`; without it `main`
// itself, ia.md A218-12). Rendered for an unknown course or lesson and, through the catch-all, for any unmatched
// path; every caller has passed requireSession, and a course is still read only for a session (design 4.Q9).
// The h1 takes focus only when a retry pressed on this same pathname is still pending as the page mounts, which
// is when this page replaced that retry's view (ia.md R2). One exception: a retry pressed after a back or
// forward press changed the URL but before Next committed it records the new pathname, so it can focus here
// too. Any other arrival leaves focus where it was.
export default async function NotFound(): Promise<ReactElement> {
  const session = await getSession();
  const courseId = session === null ? undefined : await openableCourseId();
  return (
    <main id="main" tabIndex={-1} data-region className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex max-w-3xl flex-col items-start gap-4">
        <h1 id={TITLE_ID} tabIndex={-1} className="text-2xl font-semibold">
          {notFoundTitle}
        </h1>
        <FocusOnAnyRetry id={TITLE_ID} />
        <p>{notFoundSentence}</p>
        {courseId === undefined ? null : (
          <Button asChild variant="outline">
            <Link href={catalogPath(courseId)}>{openCourseLabel}</Link>
          </Button>
        )}
      </div>
    </main>
  );
}

// Only a lesson path can carry the course to open: it always matches the lesson route, so the page's notFound()
// came from an unknown course (no action) or an unknown lesson of a listed course. The id goes through the
// per-course read like any request id, and only a course that reads gets the link; the lesson page already read
// it in this request, so cache() answers without a second read. The header cannot be told from a client's on a
// path the proxy skips, and the read bounds that case to a listed, readable course.
async function openableCourseId(): Promise<string | undefined> {
  const courseId = lessonPathCourseId((await headers()).get(PATHNAME_HEADER));
  if (courseId === undefined) return undefined;
  const course = await getCourseById(courseId);
  return course.kind === "course" ? course.tree.id : undefined;
}
