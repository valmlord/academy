"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";
import { courseLinkLabel, homeTitle } from "@/lib/copy";
import { catalogPath } from "@/lib/routes";

const LINK_CLASS_NAME =
  "rounded-md px-2 py-1.5 text-sm text-muted-foreground no-underline hover:bg-accent hover:text-foreground aria-[current=page]:text-foreground";

// design/flows/ia.md R6, "Top bar by release" (from #30): the home link is the current page only on the
// dashboard and the course link only on the catalog itself; the lesson page and not-found mark neither.
// Without a known course id (course.yaml unreadable) the course link is left out rather than linked to a
// guess (design D2).
// The links sit directly in the nav, as in the prototypes' `.topbar-nav`.
export function TopBarNav({ courseId }: { courseId: string | undefined }): ReactElement {
  const pathname = usePathname();
  const coursePath = courseId === undefined ? undefined : catalogPath(courseId);
  return (
    <nav className="flex flex-nowrap gap-1">
      <Link
        href="/"
        aria-current={pathname === "/" ? "page" : undefined}
        className={LINK_CLASS_NAME}
      >
        {homeTitle}
      </Link>
      {coursePath === undefined ? null : (
        <Link
          href={coursePath}
          aria-current={pathname === coursePath ? "page" : undefined}
          className={LINK_CLASS_NAME}
        >
          {courseLinkLabel}
        </Link>
      )}
    </nav>
  );
}
