import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactElement } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { inlineLinkClassName } from "@/components/ui/link-styles";
import { prerequisiteNotePrefix } from "@/lib/copy";
import type { LessonLink } from "@/lib/course/view";
import { lessonPath } from "@/lib/routes";

export interface PrerequisiteAlertProps {
  courseId: string;
  prerequisites: LessonLink[];
}

// design/pages/lesson F6.2-F6.3: a static warning Alert above the tabs with one link per prerequisite. It
// never locks the lesson (decision A5); without progress every prerequisite counts as not passed (#35).
export function PrerequisiteAlert({
  courseId,
  prerequisites,
}: PrerequisiteAlertProps): ReactElement | null {
  if (prerequisites.length === 0) return null;
  return (
    <Alert variant="warning" role={undefined} className="mb-4">
      <TriangleAlertIcon aria-hidden />
      <AlertTitle>
        {prerequisiteNotePrefix}
        {prerequisites.map((prerequisite, index) => (
          <Fragment key={prerequisite.id}>
            {index === 0 ? null : ", "}
            <Link href={lessonPath(courseId, prerequisite.id)} className={inlineLinkClassName}>
              {prerequisite.title}
            </Link>
          </Fragment>
        ))}
      </AlertTitle>
    </Alert>
  );
}
