import { CircleXIcon } from "lucide-react";
import type { ReactElement } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { courseErrorTitle } from "@/lib/copy";
import { RetryButton } from "./retry-button";

export const COURSE_ERROR_TITLE_ID = "course-error-title";
const RETRY_ID = "course-error-retry";

export interface CourseErrorProps {
  /** Catalog and lesson page: the alert title is the page's h1 (catalog `#state-course-error`). */
  isPageHeading: boolean;
  /** What the retry button focuses once the course loads. */
  successTargetId: string;
}

// design/pages/catalog `#state-course-error` and dashboard `#state-course-error`: a static destructive
// Alert (role removed: only the two containers of the notifications region are live, ia.md R2) with the
// retry button. A retry that fails again focuses the h1 when there is one, otherwise the button itself.
export function CourseError({ isPageHeading, successTargetId }: CourseErrorProps): ReactElement {
  return (
    <Alert variant="destructive" role={undefined}>
      <CircleXIcon aria-hidden />
      <AlertTitle>
        {isPageHeading ? (
          <h1 id={COURSE_ERROR_TITLE_ID} tabIndex={-1} className="text-sm font-semibold">
            {courseErrorTitle}
          </h1>
        ) : (
          courseErrorTitle
        )}
      </AlertTitle>
      <div className="col-start-2 mt-2">
        <RetryButton
          id={isPageHeading ? undefined : RETRY_ID}
          successTargetId={successTargetId}
          errorTargetId={isPageHeading ? COURSE_ERROR_TITLE_ID : RETRY_ID}
        />
      </div>
    </Alert>
  );
}
