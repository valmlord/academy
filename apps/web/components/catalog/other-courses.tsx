import Link from "next/link";
import type { ReactElement } from "react";
import { inlineLinkClassName } from "@/components/ui/link-styles";
import { Separator } from "@/components/ui/separator";
import { otherCoursesHeading } from "@/lib/copy";
import type { OtherCourse } from "@/lib/course/courses";
import { catalogPath } from "@/lib/routes";

// A module id is a lowercase kebab-case slug, which has no underscore, so this id differs from every module
// section's `<moduleId>` and `<moduleId>-heading`.
const HEADING_ID = "other_courses_heading";

// A218-14 (design/flows/ia.md), design/pages/catalog: the section after a Separator, one link per other
// course in the given order, named by its title, or by its id when it has none (ES10). The list takes the
// module list's layout; the `li` has no class, so each link stays an inline box that wraps with its text.
export function OtherCourses({ courses }: { courses: OtherCourse[] }): ReactElement {
  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-4 pt-8">
      <Separator />
      <h2 id={HEADING_ID} className="text-xl font-semibold">
        {otherCoursesHeading}
      </h2>
      <ul className="flex flex-col gap-2">
        {courses.map((course) => (
          <li key={course.id}>
            <Link href={catalogPath(course.id)} className={inlineLinkClassName}>
              {course.title ?? course.id}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
