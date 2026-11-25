"use client";

import { useEffect } from "react";
import { takeAnyRetryFocus, takeRetryFocus } from "./retry-button";

export interface FocusOnMountProps {
  /** The element to focus. */
  id: string;
  /**
   * The success target the retry named, when this view replaces it: the dashboard's Card heading is the
   * target, but a course without ready lessons renders `main` instead. Defaults to `id`.
   */
  retryTargetId?: string;
}

/**
 * Rendered next to a retry's success target: focuses it when a retry pressed on this pathname left its id in the
 * flag and the retry focus guard allows it.
 */
export function FocusOnMount({ id, retryTargetId = id }: FocusOnMountProps): null {
  useEffect(() => {
    if (takeRetryFocus(retryTargetId)) document.getElementById(id)?.focus();
  }, [id, retryTargetId]);
  return null;
}

export interface FocusOnAnyRetryProps {
  /** The element to focus. */
  id: string;
}

/**
 * Rendered by the not-found page, which replaces the content under the (app) layout (the top bar stays) when a
 * catalog, lesson or lesson text retry finds that the URL no longer names a course or lesson. It takes the flag
 * whatever it named and focuses `id` only when the retry was pressed on the pathname in the address bar now; a
 * flag from another pathname (a retry overtaken by a navigation here) is dropped without moving focus.
 */
export function FocusOnAnyRetry({ id }: FocusOnAnyRetryProps): null {
  useEffect(() => {
    if (takeAnyRetryFocus()) document.getElementById(id)?.focus();
  }, [id]);
  return null;
}
