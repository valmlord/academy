"use client";

import { useRouter } from "next/navigation";
import { type MouseEvent, type ReactElement, useEffect, useRef, useTransition } from "react";
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
//
// The press focuses the button (Safari leaves focus where it was on a pointer press) and stores the retry's
// block in the flag. The retry focus guard then lets FocusOnMount and the button move focus only when, at the
// take, focus is on `body` or still inside that block; a learner who moved elsewhere before the answer keeps
// their place. An element marked `data-retry-guard-outside` counts as outside the block it sits in; the marker
// goes only inside a block, never on an ancestor of one, where it would turn every move off.

interface RetryFocusFlag {
  /** The success target the retry named. */
  targetId: string;
  /** `window.location.pathname` when the retry was pressed. */
  pathname: string;
  /** The retry's block for the guard, found from the button at the press. */
  block: Element;
}

// components/ui/alert.tsx sets it: the block of a retry whose caller names none is the error's own Alert.
const ALERT_BLOCK_SELECTOR = '[data-slot="alert"]';
// RG2 (ia.md): the catalog's block is `main` without its other-courses section, which carries this marker.
const GUARD_OUTSIDE_SELECTOR = "[data-retry-guard-outside]";

let pendingRetryFocus: RetryFocusFlag | null = null;

// For a router navigation or refresh, Next writes the URL in an insertion effect of the commit that shows the
// route (app-router.js HistoryUpdater), so a passive effect of that commit reads that route's pathname. Back and
// forward differ: the browser changes the URL first and Next commits the restored route later, so a taker in a
// commit between the two reads the new pathname under the old view and drops the flag without moving focus.
function isSetOnShownPage(flag: RetryFocusFlag): boolean {
  return flag.pathname === window.location.pathname;
}

// Read after the commit that ends the refresh: an element that render removed has left focus on `body`, which
// allows the move, as RG1 (ia.md) gives it on every page but the dashboard. The press-focused button is inside
// its own block, so focus still on the button needs no branch of its own.
function isFocusLeftToRetry(block: Element, active: Element | null): boolean {
  if (active === null || active === document.body) return true;
  return block.contains(active) && active.closest(GUARD_OUTSIDE_SELECTOR) === null;
}

/**
 * Takes the flag when it names `id` and was set on the pathname window.location holds now, and returns true only
 * when the retry focus guard also allows the move. A flag naming `id` is taken either way, so a guarded "no move"
 * leaves nothing stale. A flag from another pathname is dropped and moves no focus; a flag naming another id on
 * this pathname is left for its own taker.
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
  return isFocusLeftToRetry(flag.block, document.activeElement);
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
  /**
   * The retry's block for the retry focus guard (ia.md R2): the nearest ancestor of the button matching it at
   * the press; the error's own Alert when omitted; the button alone when nothing matches.
   */
  guardBlockSelector?: string;
}

export function RetryButton({
  successTargetId,
  errorTargetId,
  id,
  describedById,
  guardBlockSelector,
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

  function retry(event: MouseEvent<HTMLButtonElement>): void {
    const button = event.currentTarget;
    // A no-op when the button already has focus; moves it there after a pointer press that did not.
    button.focus();
    // No match falls back to the button itself, which fails closed: only focus on it or on `body` allows a move.
    const block = button.closest(guardBlockSelector ?? ALERT_BLOCK_SELECTOR) ?? button;
    const flag = { targetId: successTargetId, pathname: window.location.pathname, block };
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
