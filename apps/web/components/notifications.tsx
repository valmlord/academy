"use client";

import { CircleXIcon, InfoIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { focusInto, isRendered } from "@/components/region-cycle";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  continueWorkLabel,
  idleWarningMessage,
  notificationsHeading,
  sessionExpiredMessage,
  signInAgainLabel,
} from "@/lib/copy";
import {
  IDLE_CLEARED_EVENT,
  IDLE_CONTINUE_EVENT,
  IDLE_WARNING_EVENT,
  parseIdleClearedDetail,
  parseIdleWarningDetail,
} from "@/lib/environment/idle";
import { signInPath } from "@/lib/next-path";
import { SESSION_EXPIRED_EVENT } from "@/lib/terminal/state";

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
//
// The lesson terminal dispatches `academy:session-expired` when an action answers unauthenticated (#32 design
// 3.6): the same alert, because the session is gone on the server.
//
// The environment panel's idle watcher dispatches `academy:idle-warning` and `academy:idle-cleared` (#106 design
// 5): the warning is an Alert inside the status container, and focus follows acceptance.md AC30 and ia.md R2
// "Focus after a background change" when it goes.
export function Notifications(): ReactElement {
  const [isSessionGone, setIsSessionGone] = useState(false);
  const [idleMinutes, setIdleMinutes] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const idleAlertRef = useRef<HTMLDivElement>(null);
  const entryRef = useRef<Entry | null>(null);
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

  useEffect(() => {
    const onSessionExpired = (): void => setIsSessionGone(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  // The entry into the wrapper (#106 design R8-1): where focus was when focus or a press entered it, so the
  // continue-working button can return there. Both listeners clear it for anything outside, record it from
  // where focus was for the first event inside, and keep it for later events inside.
  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      const wrapper = wrapperRef.current;
      const target = event.target;
      if (wrapper === null || !(target instanceof Node) || !wrapper.contains(target)) {
        entryRef.current = null;
        return;
      }
      // Read now: pointerdown comes before mousedown, whose default action moves focus.
      if (entryRef.current === null) entryRef.current = entryFrom(wrapper, document.activeElement);
    }
    function onFocusIn(event: FocusEvent): void {
      const wrapper = wrapperRef.current;
      const target = event.target;
      if (wrapper === null || !(target instanceof Node) || !wrapper.contains(target)) {
        entryRef.current = null;
        return;
      }
      // By focusin focus has already moved, so the element that lost it is the only record of where it was.
      if (entryRef.current === null) entryRef.current = entryFrom(wrapper, event.relatedTarget);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, []);

  useEffect(() => {
    function onWarning(event: Event): void {
      const minutes = parseIdleWarningDetail(event instanceof CustomEvent ? event.detail : null);
      if (minutes !== null) setIdleMinutes(minutes);
    }
    // A background change removed the warning. Focus moves only when it was in the warning itself, by the place
    // it was in (ia.md R2 items 5 and 6); with focus elsewhere, `body` included, nothing moves (ia.md:236), and a
    // later notice beside it (the session alert, #36's quiz notice) keeps its focus.
    function onCleared(event: Event): void {
      if (idleAlertRef.current?.contains(document.activeElement) === true) {
        if (parseIdleClearedDetail(event instanceof CustomEvent ? event.detail : null)) {
          environmentStopTarget();
        } else {
          shownPaneLanding();
        }
      }
      entryRef.current = null;
      setIdleMinutes(null);
    }
    window.addEventListener(IDLE_WARNING_EVENT, onWarning);
    window.addEventListener(IDLE_CLEARED_EVENT, onCleared);
    return () => {
      window.removeEventListener(IDLE_WARNING_EVENT, onWarning);
      window.removeEventListener(IDLE_CLEARED_EVENT, onCleared);
    };
  }, []);

  // F10.2 and AC30: focus returns to where the learner entered from, when the activation left it lost; the shown
  // pane never changes. Focus moves before the warning goes, and every target is outside the wrapper.
  function continueWork(): void {
    window.dispatchEvent(new Event(IDLE_CONTINUE_EVENT));
    if (isFocusLost(wrapperRef.current)) {
      const entry = entryRef.current;
      if (entry?.target != null && isFocusable(entry.target)) entry.target.focus();
      else if (entry?.target != null) returnTargetForPlace(entry.place);
      else shownPaneLanding();
    }
    entryRef.current = null;
    setIdleMinutes(null);
  }

  const query = searchParams.toString();
  const signInAgainHref = isSessionGone
    ? signInPath(query === "" ? pathname : `${pathname}?${query}`)
    : null;
  const hasAlert = signInAgainHref !== null;
  const hasContent = hasAlert || idleMinutes !== null;
  return (
    <div
      ref={wrapperRef}
      data-region
      data-notifications
      role={hasContent ? "region" : undefined}
      aria-labelledby={hasContent ? HEADING_ID : undefined}
      className={hasContent ? "flex flex-col gap-2 border-b px-4 py-3" : "flex flex-col gap-2 px-4"}
    >
      <h2 id={HEADING_ID} className="sr-only" hidden={!hasContent}>
        {notificationsHeading}
      </h2>
      {/* aria-live as well as the role: the menus and dialogs are modal and hide every branch but [aria-live]
          ones, so a notice set while one is open is still announced (ia.md R2). */}
      <div role="alert" aria-live="assertive" className="empty:hidden">
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
      <div role="status" aria-live="polite" className="empty:hidden">
        {idleMinutes === null ? null : (
          // Not a live alert of its own: the container is the one live element (R2).
          <Alert ref={idleAlertRef} role={undefined}>
            <InfoIcon aria-hidden className="text-info" />
            <AlertTitle>{idleWarningMessage(idleMinutes)}</AlertTitle>
            <div className="col-start-2 mt-2">
              <Button type="button" size="sm" onClick={continueWork}>
                {continueWorkLabel}
              </Button>
            </div>
          </Alert>
        )}
      </div>
    </div>
  );
}

/** Where focus was when it entered the wrapper: `target` is never `body` and never inside the wrapper. */
interface Entry {
  target: HTMLElement | null;
  /** The `[data-region]` the target was in at that moment, `null` outside every region. */
  place: HTMLElement | null;
}

/** The one writer of an entry (#106 design R8-1): only an element outside the wrapper becomes a target. */
function entryFrom(wrapper: HTMLElement, source: EventTarget | null): Entry {
  const isOutsideElement =
    source instanceof HTMLElement &&
    source !== document.body &&
    source !== document.documentElement &&
    !wrapper.contains(source);
  if (!isOutsideElement) return { target: null, place: null };
  return { target: source, place: source.closest<HTMLElement>("[data-region]") };
}

/** Focus is on nothing, on the page itself, or inside the wrapper, which is about to lose the warning. */
function isFocusLost(wrapper: HTMLElement | null): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body || active === document.documentElement) {
    return true;
  }
  return wrapper?.contains(active) === true;
}

/** Still in the page and drawn; an `aria-disabled` element counts, it keeps focus (acceptance.md, R1). */
function isFocusable(element: HTMLElement): boolean {
  return element.isConnected && isRendered(element) && !element.matches(":disabled");
}

/**
 * ia.md R2 item 6: the R3 landing of the first drawn pane, which is the lesson pane with two panes and the
 * shown one with one; `#main` on a page without panes. Never shows a pane: the shown pane does not change (AC30).
 */
function shownPaneLanding(): void {
  const shown = Array.from(document.querySelectorAll<HTMLElement>("[data-region][data-pane]")).find(
    (pane) => isRendered(pane),
  );
  if (shown !== undefined) {
    focusInto(shown);
    return;
  }
  document.getElementById("main")?.focus();
}

/**
 * A gone return target goes by the place it was in (ia.md R2 items 1-4): a drawn pane region gets its landing,
 * anything else the shown pane's. #34 and #36 add their places (a check row panel, the checks region, the quiz
 * panel).
 */
function returnTargetForPlace(place: HTMLElement | null): void {
  if (place?.hasAttribute("data-pane") === true && isRendered(place)) {
    focusInto(place);
    return;
  }
  shownPaneLanding();
}

/**
 * ia.md R2 item 5, after an idle stop: the environment's status action (start again) when the pane is drawn,
 * else the lesson pane's switch tab for the environment (one pane, the lesson shown), else the shown pane's
 * landing.
 */
function environmentStopTarget(): void {
  const environment = document.querySelector<HTMLElement>('[data-region][data-pane="environment"]');
  if (environment !== null && isRendered(environment)) {
    const action = Array.from(
      environment.querySelectorAll<HTMLElement>("[data-status-action]"),
    ).find((element) => isRendered(element));
    if (action !== undefined) action.focus();
    else focusInto(environment);
    return;
  }
  const tab = Array.from(
    document.querySelectorAll<HTMLElement>('[role="tab"][aria-controls="environment-pane"]'),
  ).find((element) => isRendered(element));
  if (tab !== undefined) {
    tab.focus();
    return;
  }
  shownPaneLanding();
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
