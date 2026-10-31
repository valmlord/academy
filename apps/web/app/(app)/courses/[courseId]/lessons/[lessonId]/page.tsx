import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { CourseError } from "@/components/course-error";
import { FocusOnMount } from "@/components/focus-on-mount";
import { LESSON_TITLE_ID, LessonHeader } from "@/components/lesson/lesson-header";
import { type LessonTab, lessonTabOf } from "@/components/lesson/lesson-panels";
import { LessonTabs } from "@/components/lesson/lesson-tabs";
import { LessonText } from "@/components/lesson/lesson-text";
import { PrerequisiteAlert } from "@/components/lesson/prerequisite-alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  breadcrumbLabel,
  courseErrorTitle,
  courseLinkLabel,
  lessonRegionHeading,
  m0LessonNote,
  notFoundTitle,
} from "@/lib/copy";
import { loadOrError } from "@/lib/course/page-error";
import { getCourse } from "@/lib/course/server";
import { findLesson, toLessonView } from "@/lib/course/view";
import { catalogPath, lessonPath, moduleAnchorPath } from "@/lib/routes";
import { requireSession } from "@/lib/session";

type LessonPageProps = PageProps<"/courses/[courseId]/lessons/[lessonId]">;

// The path requireSession returns to: the lesson with the tab it was opened on, when that tab exists.
async function returnPath({ params, searchParams }: LessonPageProps): Promise<string> {
  const { courseId, lessonId } = await params;
  const tab = lessonTabOf((await searchParams).tab);
  const path = lessonPath(courseId, lessonId);
  return tab === undefined ? path : `${path}?tab=${tab}`;
}

export async function generateMetadata(props: LessonPageProps): Promise<Metadata> {
  await requireSession(await returnPath(props));
  const { courseId, lessonId } = await props.params;
  const course = await loadOrError(getCourse);
  if (!course.ok) return { title: courseErrorTitle };
  const found = course.value.id === courseId ? findLesson(course.value, lessonId) : undefined;
  if (found === undefined) return { title: notFoundTitle };
  return { title: found.node.lesson.title };
}

// design/pages/lesson `#state-m0`: the lesson region alone, full width: breadcrumb, header, the M0 line,
// the prerequisite Alert, the theory and task tabs. `main` is no F6 stop of its own (ia.md R3: the
// region is), so the second F6 lands on the breadcrumb's course link. A course that cannot be read uses
// the catalog's error composition (#30 design notes, D2); an unknown, foreign or invisible lesson is not found.
export default async function LessonPage(props: LessonPageProps): Promise<ReactElement> {
  await requireSession(await returnPath(props));
  const { courseId, lessonId } = await props.params;
  const course = await loadOrError(getCourse);
  if (!course.ok) {
    return (
      <main id="main" tabIndex={-1} data-region className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="flex max-w-3xl flex-col gap-8">
          <CourseError isPageHeading successTargetId={LESSON_TITLE_ID} />
        </div>
      </main>
    );
  }
  const found = course.value.id === courseId ? findLesson(course.value, lessonId) : undefined;
  if (found === undefined) notFound();
  const lesson = toLessonView(course.value, found);
  const initialTab: LessonTab = lessonTabOf((await props.searchParams).tab) ?? "theory";
  return (
    <main id="main" tabIndex={-1} className="w-full min-w-0">
      <section
        data-region
        aria-labelledby="lesson-region-heading"
        className="flex min-w-0 flex-col p-4"
      >
        <h2 id="lesson-region-heading" className="sr-only">
          {lessonRegionHeading}
        </h2>
        <Breadcrumb aria-label={breadcrumbLabel} className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={catalogPath(lesson.courseId)}>{courseLinkLabel}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={moduleAnchorPath(lesson.courseId, lesson.module.id)}>
                  {lesson.module.title}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{lesson.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <LessonHeader lesson={lesson} />
        <FocusOnMount id={LESSON_TITLE_ID} />
        <p className="mb-4 text-sm text-muted-foreground">{m0LessonNote}</p>
        <PrerequisiteAlert courseId={lesson.courseId} prerequisites={lesson.prerequisites} />
        <LessonTabs
          initialTab={initialTab}
          theory={<LessonText lessonDir={found.node.dir} kind="theory" sources={lesson.sources} />}
          task={<LessonText lessonDir={found.node.dir} kind="task" sources={lesson.sources} />}
        />
      </section>
    </main>
  );
}
