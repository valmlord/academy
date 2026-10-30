import type { ReactElement } from "react";
import { Notifications } from "@/components/notifications";
import { RegionCycle } from "@/components/region-cycle";
import { TopBar } from "@/components/top-bar";
import { getSession } from "@/lib/session";
import { signOutAction } from "./actions";

// The signed-in shell: top bar, notifications, then the page's main, in F6 order (ia.md R3). Every
// page under it calls requireSession itself (ADR-0008 item 8); this read is the same cached one.
export default async function AppLayout({ children }: LayoutProps<"/">): Promise<ReactElement> {
  const session = await getSession();
  // Without a session the page redirects to sign-in; the shell would only show an empty email.
  if (session === null) return <>{children}</>;
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar email={session.user.email} signOut={signOutAction} />
      <Notifications />
      {children}
      <RegionCycle />
    </div>
  );
}
