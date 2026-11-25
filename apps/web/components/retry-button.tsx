"use client";

import { useRouter } from "next/navigation";
import { type ReactElement, useEffect, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { retryLabel } from "@/lib/copy";

// design/flows/ia.md R2, the retry action: after a retry, focus goes to the success target when the data now
// loads, and to the error target when it still fails. The page re-renders on the server, so the button cannot
// see the outcome directly: it leaves a one-shot flag naming the success target and the pathname it was pressed
// on, and whatever mounts in the commit that ends the refresh decides. The success view's FocusOnMount takes a
// flag naming its id, the not-found page's FocusOnAnyRetry takes any flag, and a button still mounted (the error
// view again) focuses the error target. A taker moves focus only for a flag set on the pathname that
// window.location holds when the taker runs, and drops one set on another. The button drops its own flag in a
// later macrotask after the commit that removes it, so a flag no taker took there never moves focus later. Every
// taker must therefore mount in the refresh's own commit (no Suspense boundary between a page and its taker).

interface RetryFocusFlag {
  /** The success target the retry named. */
  targetId: string;
  /** `window.location.pathname` when the retry was pressed. */
  pathname: string;
}

let pendingRetryFocus: RetryFocusFlag | null = null;

// For a router navigation or refresh, Next writes the URL in an insertion effect of the commit that shows the
// route (app-router.js HistoryUpdater), so a passive effect of that commit reads that route's pathname. Back and
// forward differ: the browser changes the URL first and Next commits the restored route later, so a taker in a
// commit between the two reads the new pathname under the old view and drops the flag without moving focus.
function isSetOnShownPage(flag: RetryFocusFlag): boolean {
  return flag.pathname === window.location.pathname;
}

/**
 * Takes the flag when it names `id` and was set on the pathname window.location holds now. A flag from another
 * pathname is dropped and moves no focus; a flag naming another id on this pathname is left for its own taker.
 */
export function takeRetryFocus(id: string): boolean {
  const flag = pendingRetryFocus;
  if (flag === null) return false;
  if (!isSetOnShownPage(flag)) {
    pendingRetryFocus = null;
    return false;
  }
  if (flag.targetId !== id) return false;
  pendingRetryFocus = null;
  return true;
}

/** Drops the flag, whatever it named, and reports whether it was set on the pathname window.location holds now. */
export function takeAnyRetryFocus(): boolean {
  const flag = pendingRetryFocus;
  pendingRetryFocus = null;
  return flag !== null && isSetOnShownPage(flag);
}

export interface RetryButtonProps {
  /** Focused after a retry that loads the data (a heading or a panel with `tabindex="-1"`). */
  successTargetId: string;
  /** Focused after a retry that fails again. */
  errorTargetId: string;
  /** The button's own id, for a composition whose error target is the button itself. */
  id?: string;
  /** The id of the element whose text describes the button, as its `aria-describedby`. */
  describedById?: string;
}

export function RetryButton({
  successTargetId,
  errorTargetId,
  id,
  describedById,
}: RetryButtonProps): ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const hasStarted = useRef(false);
  const ownFlag = useRef<RetryFocusFlag | null>(null);

  // Passive unmount effects run before the mount effects of the same commit, so clearing here at once would beat
  // the taker of the view that replaced this button. The drop waits for a later macrotask, and touches the flag
  // only if it is still the one this button set.
  useEffect(
    () => () => {
      const flag = ownFlag.current;
      setTimeout(() => {
        if (pendingRetryFocus === flag) pendingRetryFocus = null;
      }, 0);
    },
    [],
  );

  useEffect(() => {
    if (isPending) {
      hasStarted.current = true;
      return;
    }
    if (!hasStarted.current) return;
    hasStarted.current = false;
    if (takeRetryFocus(successTargetId)) document.getElementById(errorTargetId)?.focus();
  }, [isPending, successTargetId, errorTargetId]);

  function retry(): void {
    const flag = { targetId: successTargetId, pathname: window.location.pathname };
    pendingRetryFocus = flag;
    ownFlag.current = flag;
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <Button
      id={id}
      type="button"
      variant="secondary"
      size="sm"
      aria-describedby={describedById}
      onClick={retry}
    >
      {retryLabel}
    </Button>
  );
}
