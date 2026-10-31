"use client";

import type { MouseEvent, ReactElement } from "react";
import type { Section } from "@/components/markdown/headings";
import { inlineLinkClassName } from "@/components/ui/link-styles";
import { tableOfContentsHeading } from "@/lib/copy";

// design/pages/lesson F7.3, AC18: a link (click or Enter) focuses its h2 (tabindex -1) and scrolls it into
// view without the browser's jump, so the URL keeps `?tab=` and gains no hash.
function focusSection(event: MouseEvent<HTMLAnchorElement>, id: string): void {
  const heading = document.getElementById(id);
  if (heading === null) return;
  event.preventDefault();
  heading.focus();
  heading.scrollIntoView();
}

export function TableOfContents({ sections }: { sections: Section[] }): ReactElement | null {
  if (sections.length === 0) return null;
  return (
    <nav aria-labelledby="toc-heading" className="mb-6 text-sm">
      <h2 id="toc-heading" className="text-sm font-semibold">
        {tableOfContentsHeading}
      </h2>
      <ol className="mt-2 list-decimal pl-5">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className={inlineLinkClassName}
              onClick={(event) => focusSection(event, section.id)}
            >
              {section.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
