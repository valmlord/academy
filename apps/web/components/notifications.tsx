"use client";

import { CircleXIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactElement, useEffect, useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { notificationsHeading, sessionExpiredMessage, signInAgainLabel } from "@/lib/copy";
import { signInPath } from "@/lib/next-path";

const SESSION_ENDPOINT = "/api/auth/get-session";
const HEADING_ID = "notifications-heading";

// design/flows/ia.md R2: both live containers exist, empty, from the first render, and text is
// inserted into them, never the container, so a screen reader announces it. The wrapper is the
// notifications region (and an F6 stop) only while a container holds something.
//
// The session read on mount also extends the session: GET /api/auth/get-session is a route handler,
// where Better Auth can move the row's expiry and the cookie together (ADR-0008 item 8).
//
// The sign-in-again link is built during render from the current path and query, not when the read
// resolves, so it follows a lesson tab selected while the alert is shown (history.replaceState updates
// useSearchParams; lesson AC17).
export function Notifications(): ReactElement {
  const [isSessionGone, setIsSessionGone] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    let isMounted = true;
    readSessionIsGone().then((isGone) => {
      if (isGone && isMounted) setIsSessionGone(true);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const query = searchParams.toString();
  const signInAgainHref = isSessionGone
    ? signInPath(query === "" ? pathname : `${pathname}?${query}`)
    : null;
  const hasAlert = signInAgainHref !== null;
  return (
    <div
      data-region
      data-notifications
      role={hasAlert ? "region" : undefined}
      aria-labelledby={hasAlert ? HEADING_ID : undefined}
      className={hasAlert ? "flex flex-col gap-2 border-b px-4 py-3" : "flex flex-col gap-2 px-4"}
    >
      <h2 id={HEADING_ID} className="sr-only" hidden={!hasAlert}>
        {notificationsHeading}
      </h2>
      <div role="alert" className="empty:hidden">
        {hasAlert ? (
          // Not a live alert of its own: the container is the one live element (R2).
          <Alert variant="destructive" role={undefined}>
            <CircleXIcon aria-hidden />
            <AlertTitle>{sessionExpiredMessage}</AlertTitle>
            <div className="col-start-2 mt-2">
              <Button asChild size="sm">
                <a href={signInAgainHref}>{signInAgainLabel}</a>
              </Button>
            </div>
          </Alert>
        ) : null}
      </div>
      <div role="status" className="empty:hidden" />
    </div>
  );
}

// Dashboard AC10 is about a session the server rejected: a JSON null. A network error or another
// status says nothing about the session, so it shows nothing.
async function readSessionIsGone(): Promise<boolean> {
  try {
    const response = await fetch(SESSION_ENDPOINT, { cache: "no-store" });
    if (response.status !== 200) return false;
    const body: unknown = await response.json();
    return body === null;
  } catch {
    // Unreachable server or a body that is not JSON: as above, nothing to show.
    return false;
  }
}
