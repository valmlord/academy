import type { Metadata } from "next";
import type { ReactElement } from "react";
import { CourseError } from "@/components/course-error";
import { CourseBlock } from "@/components/dashboard/course-block";
import { NEXT_LESSON_HEADING_ID, NextLessonCard } from "@/components/dashboard/next-lesson-card";
import { FocusOnMount } from "@/components/focus-on-mount";
import { homeTitle } from "@/lib/copy";
import { getEveryCourse } from "@/lib/course/server";
import { type DashboardPageView, toDashboardPage } from "@/lib/course/view";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: homeTitle,
};

const MAIN_ID = "main";

// design/pages/dashboard: when the root fails, the course error stands in the Card's place, its retry naming the
// Card heading as the success target. Otherwise every listed course of getEveryCourse renders a block in list
// order, a failing one in the error form, and the Card comes from the readable courses.
export default async function DashboardPage(): Promise<ReactElement> {
  await requireSession("/");
  const every = await getEveryCourse();
  return (
    <main id={MAIN_ID} tabIndex={-1} data-region className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex max-w-3xl flex-col gap-8">
        <h1 className="text-2xl font-semibold">{homeTitle}</h1>
        {every.kind === "root-failure" ? (
          <CourseError isPageHeading={false} successTargetId={NEXT_LESSON_HEADING_ID} />
        ) : (
          <DashboardContent view={toDashboardPage(every.courses)} />
        )}
      </div>
    </main>
  );
}

function DashboardContent({ view }: { view: DashboardPageView }): ReactElement {
  return (
    <>
      {view.card === null ? (
        // No Card heading to take a successful retry's focus, so main takes it.
        <FocusOnMount id={MAIN_ID} retryTargetId={NEXT_LESSON_HEADING_ID} />
      ) : (
        <NextLessonCard
          courseId={view.card.courseId}
          courseTitle={view.card.courseTitle}
          lesson={view.card.lesson}
        />
      )}
      <div className="flex flex-col gap-8">
        {view.blocks.map((block) => (
          <CourseBlock key={block.courseId} block={block} />
        ))}
      </div>
    </>
  );
}
