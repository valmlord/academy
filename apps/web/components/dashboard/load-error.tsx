import { CircleXIcon } from "lucide-react";
import type { ReactElement } from "react";
import { RetryButton } from "@/components/retry-button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { NEXT_LESSON_HEADING_ID } from "./next-lesson-card";

export interface LoadErrorAlertProps {
  /** The id of the title heading, which a retry that fails again focuses. */
  titleId: string;
  titleLevel: 2 | 3;
  title: string;
  /** The element whose text describes the retry button. */
  describedById?: string;
}

// design/pages/dashboard ES1 and ES2: a destructive Alert with the read error's title as a heading and the retry
// button. The Alert's default role="alert" is removed, so the form is static: only the two containers of the
// notifications region are live (ia.md R2). The retry names the Card heading as its success target and this
// title as its error target.
export function LoadErrorAlert({
  titleId,
  titleLevel,
  title,
  describedById,
}: LoadErrorAlertProps): ReactElement {
  const headingClassName = "text-sm font-semibold";
  return (
    <Alert variant="destructive" role={undefined}>
      <CircleXIcon aria-hidden />
      <AlertTitle>
        {titleLevel === 2 ? (
          <h2 id={titleId} tabIndex={-1} className={headingClassName}>
            {title}
          </h2>
        ) : (
          <h3 id={titleId} tabIndex={-1} className={headingClassName}>
            {title}
          </h3>
        )}
      </AlertTitle>
      <div className="col-start-2 mt-2">
        <RetryButton
          successTargetId={NEXT_LESSON_HEADING_ID}
          errorTargetId={titleId}
          describedById={describedById}
        />
      </div>
    </Alert>
  );
}
