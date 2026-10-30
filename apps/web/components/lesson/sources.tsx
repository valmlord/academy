import type { ReactElement } from "react";
import { inlineLinkClassName } from "@/components/ui/link-styles";
import { sourceCheckedLabel, sourcesHeading } from "@/lib/copy";
import type { SourceView } from "@/lib/course/view";

// design/pages/lesson, the sources block: each source a same-tab link with its check date. Omitted when
// no source survives the http(s) filter of the view (`#state-no-sources`).
export function Sources({ sources }: { sources: SourceView[] }): ReactElement | null {
  if (sources.length === 0) return null;
  return (
    <div className="mt-10 max-w-[70ch]">
      <h2 className="text-xl font-semibold">{sourcesHeading}</h2>
      <ul className="mt-3 list-disc pl-5 text-sm [&>li+li]:mt-2">
        {sources.map((source) => (
          <li key={source.url}>
            <a href={source.url} className={inlineLinkClassName}>
              {source.title}
            </a>{" "}
            <span className="text-muted-foreground">{sourceCheckedLabel(source.checkedAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
