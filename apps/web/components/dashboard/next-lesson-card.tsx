import Link from "next/link";
import type { ReactElement } from "react";
import { FocusOnMount } from "@/components/focus-on-mount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { durationLabel, lessonTypeLabels, nextLessonHeading, startLessonLabel } from "@/lib/copy";
import type { NextLessonView } from "@/lib/course/view";
import { lessonPath } from "@/lib/routes";

/** The Card heading: the focus target of a course-error retry (dashboard AC8). */
export const NEXT_LESSON_HEADING_ID = "next-lesson-heading";

export interface NextLessonCardProps {
  courseId: string;
  lesson: NextLessonView;
}

// design/pages/dashboard F4.1-F4.3, first run: the first visible lesson, its module, type and duration,
// and the start button to the lesson on its theory tab. Until #35 reads progress no lesson is started, so
// the button never reads "continue" (dashboard R5).
export function NextLessonCard({ courseId, lesson }: NextLessonCardProps): ReactElement {
  return (
    <section aria-labelledby={NEXT_LESSON_HEADING_ID}>
      <Card>
        <CardHeader>
          <h2 id={NEXT_LESSON_HEADING_ID} tabIndex={-1} className="text-lg font-semibold">
            {nextLessonHeading}
          </h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-xl font-semibold">{lesson.title}</p>
          <p className="text-muted-foreground">{lesson.moduleTitle}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{lessonTypeLabels[lesson.type]}</Badge>
            <span>{durationLabel(lesson.estimatedMinutes)}</span>
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href={lessonPath(courseId, lesson.id)}>{startLessonLabel}</Link>
          </Button>
        </CardFooter>
      </Card>
      <FocusOnMount id={NEXT_LESSON_HEADING_ID} />
    </section>
  );
}
