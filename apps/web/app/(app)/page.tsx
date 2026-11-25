import type { Metadata } from "next";
import type { ReactElement } from "react";
import { CourseError } from "@/components/course-error";
import { CourseProgress } from "@/components/dashboard/course-progress";
import { NEXT_LESSON_HEADING_ID, NextLessonCard } from "@/components/dashboard/next-lesson-card";
import { FocusOnMount } from "@/components/focus-on-mount";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { homeTitle, noReadyLessonsMessage } from "@/lib/copy";
import { getFirstReadableCourse } from "@/lib/course/server";
import { type DashboardView, toDashboardView } from "@/lib/course/view";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: homeTitle,
};

const MAIN_ID = "main";

// design/pages/dashboard from #30: the Card and the progress section in the first-run state (no progress
// is read before #35), the course error with a retry that focuses the Card heading (AC8), or, with no
// ready lesson, the Empty state and nothing focusable, so F6 lands on main itself (AC7). One course, the first
// that reads, until #247 shows every course (ADR-0009 item 8).
export default async function DashboardPage(): Promise<ReactElement> {
  await requireSession("/");
  const course = await getFirstReadableCourse();
  return (
    <main id={MAIN_ID} tabIndex={-1} data-region className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex max-w-3xl flex-col gap-8">
        <h1 className="text-2xl font-semibold">{homeTitle}</h1>
        {course.kind === "course" ? (
          <DashboardContent view={toDashboardView(course.tree)} />
        ) : (
          <CourseError isPageHeading={false} successTargetId={NEXT_LESSON_HEADING_ID} />
        )}
      </div>
    </main>
  );
}

function DashboardContent({ view }: { view: DashboardView }): ReactElement {
  if (view.next === null) {
    return (
      <>
        <Empty className="gap-3 rounded-lg border px-6 py-8">
          <EmptyHeader>
            <EmptyTitle className="text-lg font-semibold">{noReadyLessonsMessage}</EmptyTitle>
          </EmptyHeader>
        </Empty>
        <FocusOnMount id={MAIN_ID} retryTargetId={NEXT_LESSON_HEADING_ID} />
      </>
    );
  }
  return (
    <>
      <NextLessonCard courseId={view.courseId} lesson={view.next} />
      <CourseProgress view={view} />
    </>
  );
}
