import Link from "next/link";
import type { ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import {
  modulePreparingLabel,
  moduleProgressLabel,
  noPassedLessonsMessage,
  progressValueText,
} from "@/lib/copy";
import type { CourseBlockView } from "@/lib/course/view";
import { moduleAnchorPath } from "@/lib/routes";
import { ModuleBar } from "./module-bar";

// No progress is read before #35 (Stepan, 2026-10-30): the first-run state, nothing passed.
const PASSED_LESSONS = 0;

type ReadableCourseBlockView = Extract<CourseBlockView, { form: "readable" }>;

// design/pages/dashboard F18.1-F18.2: the readable block's body, the course line naming the course bar valued
// "N of M", then one row per module linking its catalog section: an available module with its count and a
// decorative bar, a module being prepared with its Badge and no bar (dashboard AC5).
export function CourseProgress({ block }: { block: ReadableCourseBlockView }): ReactElement {
  const lineId = `course-${block.courseId}-line`;
  return (
    <>
      <div className="flex flex-col gap-2">
        <p id={lineId}>{noPassedLessonsMessage}</p>
        <Progress
          value={PASSED_LESSONS}
          max={block.totalLessons}
          valueText={progressValueText(PASSED_LESSONS, block.totalLessons)}
          aria-labelledby={lineId}
        />
      </div>
      <ItemGroup>
        {block.modules.map((module) => (
          <li key={module.id}>
            <Item asChild>
              <Link href={moduleAnchorPath(block.courseId, module.id)}>
                <ItemContent>
                  <ItemTitle>{module.title}</ItemTitle>
                  {module.isAvailable ? (
                    <>
                      <ItemDescription>
                        {moduleProgressLabel(PASSED_LESSONS, module.lessonCount)}
                      </ItemDescription>
                      <ModuleBar passed={PASSED_LESSONS} total={module.lessonCount} />
                    </>
                  ) : null}
                </ItemContent>
                {module.isAvailable ? null : (
                  <ItemActions>
                    <Badge variant="outline" tone="muted">
                      {modulePreparingLabel}
                    </Badge>
                  </ItemActions>
                )}
              </Link>
            </Item>
          </li>
        ))}
      </ItemGroup>
    </>
  );
}
