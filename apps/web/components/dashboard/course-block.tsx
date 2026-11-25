import Link from "next/link";
import type { ReactElement } from "react";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { headingLinkClassName, inlineLinkClassName } from "@/components/ui/link-styles";
import { nextLessonLinkLabel, noReadyLessonsMessage } from "@/lib/copy";
import { courseElementId } from "@/lib/course/element-id";
import type { CourseBlockView } from "@/lib/course/view";
import { catalogPath, lessonPath } from "@/lib/routes";
import { CourseProgress } from "./course-progress";

// design/pages/dashboard F20.2-F20.4: one course's block, named by its h2, whose whole text links to the
// course's catalog. The readable form adds the next-lesson link into this course (none in the Card course's
// block), the course line and the module rows; the empty form only the Empty text.
export function CourseBlock({ block }: { block: CourseBlockView }): ReactElement {
  const headingId = courseElementId(block.courseId, "heading");
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} tabIndex={-1} className="text-lg font-semibold">
        <Link href={catalogPath(block.courseId)} className={headingLinkClassName}>
          {block.courseTitle}
        </Link>
      </h2>
      {block.form === "readable" ? (
        <>
          {block.nextLesson === null ? null : (
            <p>
              <Link
                href={lessonPath(block.courseId, block.nextLesson.id)}
                className={inlineLinkClassName}
              >
                {nextLessonLinkLabel(block.nextLesson.title)}
              </Link>
            </p>
          )}
          <CourseProgress block={block} />
        </>
      ) : (
        <Empty>
          <EmptyDescription>{noReadyLessonsMessage}</EmptyDescription>
        </Empty>
      )}
    </section>
  );
}
