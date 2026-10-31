import type { ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import { inlineLinkClassName } from "@/components/ui/link-styles";
import { moduleAvailableLabel, modulePreparingLabel } from "@/lib/copy";
import type { CatalogModuleView } from "@/lib/course/view";

/** Available (secondary) or being prepared (outline, muted tone): catalog AC1, ia.md "module status". */
export function ModuleStatusBadge({ isAvailable }: { isAvailable: boolean }): ReactElement {
  return isAvailable ? (
    <Badge variant="secondary">{moduleAvailableLabel}</Badge>
  ) : (
    <Badge variant="outline" tone="muted">
      {modulePreparingLabel}
    </Badge>
  );
}

export function moduleHeading(module: CatalogModuleView): string {
  return `${module.number}. ${module.title}`;
}

// design/pages/catalog F5.1: every module in course order, each a link to its section and its status.
// The links are plain in-page anchors; FragmentFocus moves focus to the section heading.
export function ModuleList({ modules }: { modules: CatalogModuleView[] }): ReactElement {
  return (
    <ol className="flex flex-col gap-2">
      {modules.map((module) => (
        <li key={module.id} className="flex flex-wrap items-center gap-2">
          <a href={`#${module.id}`} className={inlineLinkClassName}>
            {moduleHeading(module)}
          </a>
          <ModuleStatusBadge isAvailable={module.isAvailable} />
        </li>
      ))}
    </ol>
  );
}
