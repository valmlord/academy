import Link from "next/link";
import { Fragment, type ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { inlineLinkClassName } from "@/components/ui/link-styles";
import {
  lessonNotStartedLabel,
  lessonRowMeta,
  lessonTypeLabels,
  prerequisiteNotePrefix,
} from "@/lib/copy";
import type { CatalogLessonView } from "@/lib/course/view";
import { lessonPath } from "@/lib/routes";

export interface LessonRowProps {
  courseId: string;
  lesson: CatalogLessonView;
}

// design/pages/catalog F5.3-F5.4 and F6.1: the row is one link (number and title, type and duration,
// the status Badge); the prerequisite note is a sibling `p` in the same `li`, so its links come right
// after the row in the Tab order and are never nested in the row link (catalog AC5).
export function LessonRow({ courseId, lesson }: LessonRowProps): ReactElement {
  return (
    <li>
      <Item asChild>
        <Link href={lessonPath(courseId, lesson.id)}>
          <ItemContent>
            <ItemTitle>{`${lesson.number}. ${lesson.title}`}</ItemTitle>
            <ItemDescription>
              {lessonRowMeta(lessonTypeLabels[lesson.type], lesson.estimatedMinutes)}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Badge variant="outline" tone="muted">
              {lessonNotStartedLabel}
            </Badge>
          </ItemActions>
        </Link>
      </Item>
      {lesson.prerequisites.length === 0 ? null : (
        <p className="px-4 pb-3 text-sm text-muted-foreground">
          {prerequisiteNotePrefix}
          {lesson.prerequisites.map((prerequisite, index) => (
            <Fragment key={prerequisite.id}>
              {index === 0 ? null : ", "}
              <Link href={lessonPath(courseId, prerequisite.id)} className={inlineLinkClassName}>
                {prerequisite.title}
              </Link>
            </Fragment>
          ))}
        </p>
      )}
    </li>
  );
}
