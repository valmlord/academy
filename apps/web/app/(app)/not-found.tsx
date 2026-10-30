import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { notFoundTitle, openCourseLabel } from "@/lib/copy";
import { loadOrError } from "@/lib/course/page-error";
import { getCourse } from "@/lib/course/server";
import { catalogPath } from "@/lib/routes";
import { getSession } from "@/lib/session";

// Also set by every page that calls notFound(), so the title does not depend on this export.
export const metadata: Metadata = {
  title: notFoundTitle,
};

// design/flows/catalog.md F5 error states (deviation D1: no prototype): an app-shell state with the top
// bar, the not-found h1 and the open-course button link, the F6 stop `main` landing on it. Rendered for an
// unknown course or lesson and, through the catch-all, for any unmatched path; every caller has passed
// requireSession, and the course is still read only for a session (design 4.Q9).
export default async function NotFound(): Promise<ReactElement> {
  const session = await getSession();
  const course = session === null ? null : await loadOrError(getCourse);
  const courseId =
    course === null ? undefined : course.ok ? course.value.id : course.error.courseId;
  return (
    <main id="main" tabIndex={-1} data-region className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex max-w-3xl flex-col items-start gap-4">
        <h1 className="text-2xl font-semibold">{notFoundTitle}</h1>
        {courseId === undefined ? null : (
          <Button asChild variant="outline">
            <Link href={catalogPath(courseId)}>{openCourseLabel}</Link>
          </Button>
        )}
      </div>
    </main>
  );
}
