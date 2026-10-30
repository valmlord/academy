import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { homeTitle, noReadyLessonsMessage } from "@/lib/copy";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: homeTitle,
};

// design/pages/dashboard, state "no ready lessons", shown unconditionally until #30 reads the course
// (Stepan, 2026-10-30; the PR's "Design deviations"). main holds nothing focusable, so F6 lands on main
// itself (dashboard AC7).
export default async function DashboardPage(): Promise<ReactElement> {
  await requireSession("/");
  return (
    <main id="main" tabIndex={-1} data-region className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex max-w-3xl flex-col gap-8">
        <h1 className="text-2xl font-semibold">{homeTitle}</h1>
        <Empty className="gap-3 rounded-lg border px-6 py-8">
          <EmptyHeader>
            <EmptyTitle className="text-lg font-semibold">{noReadyLessonsMessage}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    </main>
  );
}
