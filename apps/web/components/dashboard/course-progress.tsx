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
import type { DashboardView } from "@/lib/course/view";
import { moduleAnchorPath } from "@/lib/routes";
import { ModuleBar } from "./module-bar";

const PROGRESS_HEADING_ID = "progress-heading";
// No progress is read before #35 (Stepan, 2026-10-30): the first-run state, nothing passed.
const PASSED_LESSONS = 0;

// design/pages/dashboard F18.1-F18.2, `#state-first-run`: the course line with the course bar (named by
// the line, valued "N of M"), then one row per module linking its catalog section: an available module
// with its count and a decorative bar, a module being prepared with its Badge and no bar (dashboard AC5).
export function CourseProgress({ view }: { view: DashboardView }): ReactElement {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 id={PROGRESS_HEADING_ID} tabIndex={-1} className="text-lg font-semibold">
          {noPassedLessonsMessage}
        </h2>
        <Progress
          value={PASSED_LESSONS}
          max={view.totalLessons}
          valueText={progressValueText(PASSED_LESSONS, view.totalLessons)}
          aria-labelledby={PROGRESS_HEADING_ID}
        />
      </div>
      <ItemGroup>
        {view.modules.map((module) => (
          <li key={module.id}>
            <Item asChild>
              <Link href={moduleAnchorPath(view.courseId, module.id)}>
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
    </section>
  );
}
