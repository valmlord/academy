import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { FragmentFocus } from "@/components/catalog/fragment-focus";
import { ModuleList } from "@/components/catalog/module-list";
import { ModuleSection } from "@/components/catalog/module-section";
import { CourseError } from "@/components/course-error";
import { FocusOnMount } from "@/components/focus-on-mount";
import { courseErrorTitle, notFoundTitle } from "@/lib/copy";
import { loadOrError } from "@/lib/course/page-error";
import { getCourse } from "@/lib/course/server";
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
  const course = await loadOrError(getCourse);
  if (!course.ok) return { title: courseErrorTitle };
  if (course.value.id !== courseId) return { title: notFoundTitle };
  return { title: course.value.title };
}

// design/pages/catalog: the course header, the module list, one section per module. A course that cannot
// be read shows only the error Alert, whose title is the h1 (`#state-course-error`, catalog AC8).
export default async function CatalogPage({
  params,
}: PageProps<"/courses/[courseId]">): Promise<ReactElement> {
  const { courseId } = await params;
  await requireSession(catalogPath(courseId));
  const course = await loadOrError(getCourse);
  if (!course.ok) {
    return (
      <main id="main" tabIndex={-1} data-region className={MAIN_CLASS_NAME}>
        <div className={COLUMN_CLASS_NAME}>
          <CourseError isPageHeading successTargetId={TITLE_ID} />
        </div>
      </main>
    );
  }
  if (course.value.id !== courseId) notFound();
  const view = toCatalogView(course.value);
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
      </div>
      <FragmentFocus />
    </main>
  );
}
