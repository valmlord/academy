import type { ReactElement } from "react";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ItemGroup } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { noModuleLessonsMessage, outcomesHeading } from "@/lib/copy";
import type { CatalogModuleView } from "@/lib/course/view";
import { LessonRow } from "./lesson-row";
import { ModuleStatusBadge, moduleHeading } from "./module-list";

export interface ModuleSectionProps {
  courseId: string;
  module: CatalogModuleView;
}

// design/pages/catalog F5.2: one section per module, labelled by its h2. The h2 takes focus from the
// module list and from a `#<moduleId>` arrival (tabindex -1). The outcomes block only when the module has
// outcomes (planned modules have none); the "no lessons yet" Empty instead of the list when no lesson is
// visible (catalog AC4).
export function ModuleSection({ courseId, module }: ModuleSectionProps): ReactElement {
  const headingId = `${module.id}-heading`;
  return (
    <section id={module.id} aria-labelledby={headingId} className="flex flex-col gap-4 pt-8">
      <Separator />
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={headingId} tabIndex={-1} className="text-xl font-semibold">
          {moduleHeading(module)}
        </h2>
        <ModuleStatusBadge isAvailable={module.isAvailable} />
      </div>
      <p>{module.summary}</p>
      {module.outcomes.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{outcomesHeading}</h3>
          <ul className="list-disc pl-6 text-sm [&>li+li]:mt-1">
            {module.outcomes.map((outcome) => (
              <li key={outcome}>{outcome}</li>
            ))}
          </ul>
        </div>
      )}
      {module.lessons.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{noModuleLessonsMessage}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup aria-labelledby={headingId}>
          {module.lessons.map((lesson) => (
            <LessonRow key={lesson.id} courseId={courseId} lesson={lesson} />
          ))}
        </ItemGroup>
      )}
    </section>
  );
}
