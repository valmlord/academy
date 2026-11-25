import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { CourseError } from "@/components/course-error";
import { EnvironmentRegion } from "@/components/environment/environment-region";
import { FocusOnMount } from "@/components/focus-on-mount";
import { LESSON_TITLE_ID, LessonHeader } from "@/components/lesson/lesson-header";
import { LessonLayout } from "@/components/lesson/lesson-layout";
import { LESSON_PANE_IDS, type LessonTab, lessonTabOf } from "@/components/lesson/lesson-panels";
import { LessonTabs } from "@/components/lesson/lesson-tabs";
import { LessonText } from "@/components/lesson/lesson-text";
import { PaneSwitch } from "@/components/lesson/pane-switch";
import { PrerequisiteAlert } from "@/components/lesson/prerequisite-alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  breadcrumbLabel,
  courseErrorTitle,
  lessonRegionHeading,
  m0LessonNote,
  notFoundTitle,
} from "@/lib/copy";
import { getCourseById } from "@/lib/course/server";
import { findLesson, toLessonView } from "@/lib/course/view";
import { catalogPath, lessonPath, moduleAnchorPath } from "@/lib/routes";
import { requireSession } from "@/lib/session";
import { RECONNECT_ATTEMPTS, readIntegerSetting, START_SLOW_SECONDS } from "@/lib/workspace/env";

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
  const course = await getCourseById(courseId);
  if (course.kind === "not-found") return { title: notFoundTitle };
  if (course.kind !== "course") return { title: courseErrorTitle };
  const found = findLesson(course.tree, lessonId);
  if (found === undefined) return { title: notFoundTitle };
  return { title: found.node.lesson.title };
}

// The lesson region: breadcrumb, header, the prerequisite Alert, the theory and task tabs. A lesson with a
// `workspace` gets the two-pane lesson layout with the environment region (#106 design 2.2: two panes and the
// split handle from 64rem, one pane with the switch below); one without keeps design/pages/lesson `#state-m0`,
// full width with the M0 line.
// `main` is no F6 stop of its own (ia.md R3: the regions are), so the second F6 lands on the breadcrumb's
// course link. A course id that names no course of the root is not found; a course that cannot be read uses
// the catalog's error composition (#30 design notes, D2); an unknown, foreign or invisible lesson is not found.
export default async function LessonPage(props: LessonPageProps): Promise<ReactElement> {
  await requireSession(await returnPath(props));
  const { courseId, lessonId } = await props.params;
  const course = await getCourseById(courseId);
  if (course.kind === "not-found") notFound();
  if (course.kind !== "course") {
    return (
      <main id="main" tabIndex={-1} data-region className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="flex max-w-3xl flex-col gap-8">
          <CourseError isPageHeading successTargetId={LESSON_TITLE_ID} />
        </div>
      </main>
    );
  }
  const found = findLesson(course.tree, lessonId);
  if (found === undefined) notFound();
  const lesson = toLessonView(course.tree, found);
  const initialTab: LessonTab = lessonTabOf((await props.searchParams).tab) ?? "theory";
  const hasEnvironment = found.node.lesson.workspace !== undefined;
  const heading = (
    <h2 id="lesson-region-heading" className="sr-only">
      {lessonRegionHeading}
    </h2>
  );
  const content = (
    <>
      <Breadcrumb aria-label={breadcrumbLabel} className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={catalogPath(lesson.courseId)}>{lesson.courseTitle}</Link>
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
      {hasEnvironment ? null : <p className="mb-4 text-sm text-muted-foreground">{m0LessonNote}</p>}
      <PrerequisiteAlert courseId={lesson.courseId} prerequisites={lesson.prerequisites} />
      <LessonTabs
        initialTab={initialTab}
        theory={<LessonText lessonDir={found.node.dir} kind="theory" sources={lesson.sources} />}
        task={<LessonText lessonDir={found.node.dir} kind="task" sources={lesson.sources} />}
      />
    </>
  );
  if (!hasEnvironment) {
    return (
      <main id="main" tabIndex={-1} className="w-full min-w-0">
        <section
          data-region
          aria-labelledby="lesson-region-heading"
          className="flex min-w-0 flex-col p-4"
        >
          {heading}
          {content}
        </section>
      </main>
    );
  }
  return (
    <LessonLayout
      lesson={
        // Only `pane`: the layout CSS sizes the section, and a utility for the same property would compete.
        <section
          id={LESSON_PANE_IDS.lesson}
          data-region
          data-pane="lesson"
          aria-labelledby="lesson-region-heading"
          className="pane"
        >
          {heading}
          <PaneSwitch />
          <ScrollArea className="flex-1 p-4">{content}</ScrollArea>
        </section>
      }
      environment={
        <EnvironmentRegion
          courseId={lesson.courseId}
          lessonId={lesson.id}
          courseHref={catalogPath(lesson.courseId)}
          // Read per request on the server; the startup check already refused an invalid value.
          reconnectAttempts={readIntegerSetting(
            { TERMINAL_RECONNECT_ATTEMPTS: process.env.TERMINAL_RECONNECT_ATTEMPTS },
            RECONNECT_ATTEMPTS,
          )}
          startSlowSeconds={readIntegerSetting(
            { ENVIRONMENT_START_SLOW_SECONDS: process.env.ENVIRONMENT_START_SLOW_SECONDS },
            START_SLOW_SECONDS,
          )}
        />
      }
    />
  );
}
