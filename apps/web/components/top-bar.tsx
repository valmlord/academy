import Link from "next/link";
import type { ReactElement } from "react";
import { brandName, homeTitle } from "@/lib/copy";
import { UserMenu } from "./user-menu";

export interface TopBarProps {
  email: string;
  signOut: () => Promise<never>;
}

// design/pages/dashboard top bar (the banner, first F6 stop). The course link waits for #30's catalog:
// a link to a page that does not exist yet would be a dead end (ia.md R6; PR "Design deviations").
// One row down to 375px; below that the user menu wraps to a second row, right-aligned.
export function TopBar({ email, signOut }: TopBarProps): ReactElement {
  return (
    <header
      data-region
      className="flex min-h-14 flex-wrap items-center gap-4 border-b bg-background px-4 py-2 max-[30rem]:gap-2"
    >
      <Link href="/" className="font-semibold text-foreground no-underline">
        {brandName}
      </Link>
      <nav className="flex flex-nowrap gap-1">
        <Link
          href="/"
          aria-current="page"
          className="rounded-md px-2 py-1.5 text-sm text-foreground no-underline hover:bg-accent"
        >
          {homeTitle}
        </Link>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <UserMenu email={email} signOut={signOut} />
      </div>
    </header>
  );
}
