import Link from "next/link";
import type { ReactElement } from "react";
import { brandName } from "@/lib/copy";
import { TopBarNav } from "./top-bar-nav";
import { UserMenu } from "./user-menu";

export interface TopBarProps {
  email: string;
  signOut: () => Promise<never>;
  /** The course the course link opens (the first that reads until #241), or undefined when none reads. */
  courseId: string | undefined;
}

// The top bar of every signed-in page (the banner, first F6 stop), "from #30" in ia.md R6: brand, home
// link, course link, user menu. One row down to 375px; below that the user menu wraps to a second row,
// right-aligned.
export function TopBar({ email, signOut, courseId }: TopBarProps): ReactElement {
  return (
    <header
      data-region
      className="flex min-h-14 flex-wrap items-center gap-4 border-b bg-background px-4 py-2 max-[30rem]:gap-2"
    >
      <Link href="/" className="font-semibold text-foreground no-underline">
        {brandName}
      </Link>
      <TopBarNav courseId={courseId} />
      <div className="ml-auto flex items-center gap-2">
        <UserMenu email={email} signOut={signOut} />
      </div>
    </header>
  );
}
