"use client";

import { useEffect } from "react";
import { takeRetryFocus } from "./retry-button";

export interface FocusOnMountProps {
  /** The element to focus. */
  id: string;
  /**
   * The success target the retry named, when this view replaces it: the dashboard's Card heading is the
   * target, but a course without ready lessons renders `main` instead. Defaults to `id`.
   */
  retryTargetId?: string;
}

/** Rendered next to a retry's success target: focuses it when a retry left its id in the flag. */
export function FocusOnMount({ id, retryTargetId = id }: FocusOnMountProps): null {
  useEffect(() => {
    if (takeRetryFocus(retryTargetId)) document.getElementById(id)?.focus();
  }, [id, retryTargetId]);
  return null;
}
