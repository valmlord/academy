"use client";

import { useRouter } from "next/navigation";
import { type ReactElement, useEffect, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { retryLabel } from "@/lib/copy";

// design/flows/ia.md R2, the retry action: after a retry, focus goes to the success target when the data now
// loads, and to the error target when it still fails. The page re-renders on the server, so the button
// cannot see the outcome directly: it leaves the success target's id in a one-shot flag; the success
// view's FocusOnMount takes it when it mounts. A refresh that ends with the flag still set rendered the
// error view again (the button stayed mounted), so the button focuses the error target.

let pendingRetryFocus: string | null = null;

/** Clears the flag and reports whether it named `id`. */
export function takeRetryFocus(id: string): boolean {
  if (pendingRetryFocus !== id) return false;
  pendingRetryFocus = null;
  return true;
}

export interface RetryButtonProps {
  /** Focused after a retry that loads the data (a heading or a panel with `tabindex="-1"`). */
  successTargetId: string;
  /** Focused after a retry that fails again. */
  errorTargetId: string;
  /** The button's own id, for a composition whose error target is the button itself. */
  id?: string;
}

export function RetryButton({
  successTargetId,
  errorTargetId,
  id,
}: RetryButtonProps): ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const hasStarted = useRef(false);

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
    pendingRetryFocus = successTargetId;
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <Button id={id} type="button" variant="secondary" size="sm" onClick={retry}>
      {retryLabel}
    </Button>
  );
}
