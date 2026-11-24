import type { ReactElement } from "react";
import { Notifications } from "@/components/notifications";
import { RegionCycle } from "@/components/region-cycle";
import { TopBar } from "@/components/top-bar";
import { getFirstReadableCourse } from "@/lib/course/server";
import { getSession } from "@/lib/session";
import { signOutAction } from "./actions";

// The signed-in shell: top bar, notifications, then the page's main, in F6 order (ia.md R3). Every
// page under it calls requireSession itself (ADR-0008 item 8); this read is the same cached one.
// `data-app-shell` lets the lesson layout's CSS give the shell the viewport height (globals.css).
export default async function AppLayout({ children }: LayoutProps<"/">): Promise<ReactElement> {
  const session = await getSession();
  // Without a session the page redirects to sign-in; the shell would only show an empty email.
  if (session === null) return <>{children}</>;
  // Read only after the session check, so an anonymous or forged-cookie render never opens a course file.
  // The course link opens only a course that reads: a failing course's catalog shows nothing but the course
  // error, so the link is left out although a failure names its course. The one-course seam until #241,
  // which removes the link (A218-3, ADR-0009 item 8).
  const course = await getFirstReadableCourse();
  const courseId = course.kind === "course" ? course.tree.id : undefined;
  return (
    <div data-app-shell className="flex min-h-screen flex-col">
      <TopBar email={session.user.email} signOut={signOutAction} courseId={courseId} />
      <Notifications />
      {children}
      <RegionCycle />
    </div>
  );
}
