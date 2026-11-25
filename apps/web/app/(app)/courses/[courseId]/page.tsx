import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { FragmentFocus } from "@/components/catalog/fragment-focus";
import { ModuleList } from "@/components/catalog/module-list";
import { ModuleSection } from "@/components/catalog/module-section";
import { OtherCourses } from "@/components/catalog/other-courses";
import { CourseError } from "@/components/course-error";
import { FocusOnMount } from "@/components/focus-on-mount";
import { courseErrorTitle, notFoundTitle } from "@/lib/copy";
import { getCourseById, getOtherCourses } from "@/lib/course/server";
import { toCatalogView } from "@/lib/course/view";
import { catalogPath } from "@/lib/routes";
import { requireSession } from "@/lib/session";

const TITLE_ID = "course-title";
const MAIN_CLASS_NAME = "mx-auto w-full max-w-6xl px-4 py-6";
const COLUMN_CLASS_NAME = "flex max-w-3xl flex-col gap-8";

// The <title> follows the branch the page takes: the course, the course error, or not-found (design 4.Q5).
export async function generateMetadata({
  params,
}: PageProps<"/courses/[courseId]">): Promise<Metadata> {
  const { courseId } = await params;
  await requireSession(catalogPath(courseId));
  const course = await getCourseById(courseId);
  if (course.kind === "not-found") return { title: notFoundTitle };
  if (course.kind !== "course") return { title: courseErrorTitle };
  return { title: course.tree.title };
}

// The other-courses section when the listing holds another course in the course id form (A218-14); none on a
// root failure of that listing.
async function otherCoursesOf(courseId: string): Promise<ReactElement | null> {
  const others = await getOtherCourses(courseId);
  if (others.kind === "root-failure" || others.courses.length === 0) return null;
  return <OtherCourses courses={others.courses} />;
}

// design/pages/catalog: the course header, the module list, one section per module, then any other-courses
// section. A course id that names no course of the root is not found; a course that cannot be read shows the
// error Alert, whose title is the h1 (`#state-course-error`, catalog AC8), then any other-courses section
// (ES7); a root that cannot be read shows the error Alert alone (ES8).
export default async function CatalogPage({
  params,
}: PageProps<"/courses/[courseId]">): Promise<ReactElement> {
  const { courseId } = await params;
  await requireSession(catalogPath(courseId));
  const course = await getCourseById(courseId);
  if (course.kind === "not-found") notFound();
  if (course.kind !== "course") {
    return (
      <main id="main" tabIndex={-1} data-region className={MAIN_CLASS_NAME}>
        <div className={COLUMN_CLASS_NAME}>
          <CourseError isPageHeading successTargetId={TITLE_ID} />
          {course.kind === "course-failure" ? await otherCoursesOf(courseId) : null}
        </div>
      </main>
    );
  }
  const view = toCatalogView(course.tree);
  return (
    <main id="main" tabIndex={-1} data-region className={MAIN_CLASS_NAME}>
      <div className={COLUMN_CLASS_NAME}>
        <div className="flex flex-col gap-2">
          <h1 id={TITLE_ID} tabIndex={-1} className="text-2xl font-semibold">
            {view.title}
          </h1>
          <FocusOnMount id={TITLE_ID} />
          <p className="text-muted-foreground">{view.description}</p>
        </div>
        <ModuleList modules={view.modules} />
        <div>
          {view.modules.map((module) => (
            <ModuleSection key={module.id} courseId={view.id} module={module} />
          ))}
        </div>
        {await otherCoursesOf(courseId)}
      </div>
      <FragmentFocus />
    </main>
  );
}
