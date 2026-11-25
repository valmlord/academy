"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";
import { homeTitle } from "@/lib/copy";

const LINK_CLASS_NAME =
  "rounded-md px-2 py-1.5 text-sm text-muted-foreground no-underline hover:bg-accent hover:text-foreground aria-[current=page]:text-foreground";

// A218-3: one link, the home page, marked current on the dashboard only.
// The link sits directly in the nav, as in the prototypes' `.topbar-nav`.
export function TopBarNav(): ReactElement {
  const pathname = usePathname();
  return (
    <nav className="flex flex-nowrap gap-1">
      <Link
        href="/"
        aria-current={pathname === "/" ? "page" : undefined}
        className={LINK_CLASS_NAME}
      >
        {homeTitle}
      </Link>
    </nav>
  );
}
