"use client";

import { useEffect } from "react";
import { takeRetryFocus } from "./retry-button";

/** Rendered next to a retry's success target: focuses it when a retry left its id in the flag. */
export function FocusOnMount({ id }: { id: string }): null {
  useEffect(() => {
    if (takeRetryFocus(id)) document.getElementById(id)?.focus();
  }, [id]);
  return null;
}
