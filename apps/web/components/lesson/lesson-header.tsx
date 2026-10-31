import type { ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import { durationLabel, lessonTypeLabels } from "@/lib/copy";
import type { LessonView } from "@/lib/course/view";
import { Outcomes } from "./outcomes";

/** The h1's id: the focus target of a course-error retry on the lesson page (#30 design notes, D2). */
export const LESSON_TITLE_ID = "lesson-title";

// design/pages/lesson F7.1: the h1, the meta line (type Badge, duration) and the outcomes.
export function LessonHeader({ lesson }: { lesson: LessonView }): ReactElement {
  return (
    <div className="mb-4 flex flex-col gap-2">
      <h1
        id={LESSON_TITLE_ID}
        tabIndex={-1}
        className="text-2xl font-semibold [overflow-wrap:anywhere]"
      >
        {lesson.title}
      </h1>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{lessonTypeLabels[lesson.type]}</Badge>
        <span>{durationLabel(lesson.estimatedMinutes)}</span>
      </p>
      <Outcomes outcomes={lesson.outcomes} />
    </div>
  );
}
