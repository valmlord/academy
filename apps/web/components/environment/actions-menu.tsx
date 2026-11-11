"use client";

import { type ReactElement, type RefObject, useEffect, useId, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  actionsMenuLabel,
  cancelLabel,
  environmentNotRunningReason,
  resetConfirmLabel,
  resetDialogDescription,
  resetDialogTitle,
  resetWorkspaceLabel,
  restartEnvironmentLabel,
  screenReaderModeLabel,
} from "@/lib/copy";

// The environment's actions menu and the reset confirmation (design/flows/lesson-environment.md F11,
// acceptance.md AC11). The menu stays modal: while it is open the rest of the page is hidden from assistive
// technology (acceptance.md AC52), which #36's quiz relies on.

export interface ActionsMenuProps {
  isEnvironmentRunning: boolean;
  isScreenReaderMode: boolean;
  onRestart(): void;
  onReset(): void;
  onScreenReaderModeChange(isOn: boolean): void;
  /** The trigger, which the panel focuses after a status action (AC12). */
  triggerRef: RefObject<HTMLButtonElement | null>;
}

/** Why restart and reset are unavailable, or `null` when they are available. #34 adds its own reason here. */
export function actionsDisabledReason(isEnvironmentRunning: boolean): string | null {
  return isEnvironmentRunning ? null : environmentNotRunningReason;
}

export function ActionsMenu({
  isEnvironmentRunning,
  isScreenReaderMode,
  onRestart,
  onReset,
  onScreenReaderModeChange,
  triggerRef,
}: ActionsMenuProps): ReactElement {
  const [isResetOpen, setIsResetOpen] = useState(false);
  // Set by the reset item; the dialog opens once the menu has closed, so the two modal layers never overlap.
  const isDialogPendingRef = useRef(false);
  // Radix calls the menu's close handler a tick after the select, from the last render's closure; a stop in that
  // tick must still keep the dialog shut, so the handler reads the status through this ref.
  const isEnvironmentRunningRef = useRef(isEnvironmentRunning);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const reason = actionsDisabledReason(isEnvironmentRunning);

  // A stop while the dialog is open (idle, another tab) would leave a reset button that does nothing (the machine
  // resets only a running environment): close it, and the dialog's close handler puts focus on the trigger (R2).
  useEffect(() => {
    isEnvironmentRunningRef.current = isEnvironmentRunning;
    if (!isEnvironmentRunning) setIsResetOpen(false);
  }, [isEnvironmentRunning]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={triggerRef} type="button" variant="outline" size="sm">
            {actionsMenuLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={() => {
            if (!isDialogPendingRef.current) return;
            isDialogPendingRef.current = false;
            if (isEnvironmentRunningRef.current) setIsResetOpen(true);
          }}
        >
          <ActionItem label={restartEnvironmentLabel} reason={reason} onSelect={onRestart} />
          <ActionItem
            label={resetWorkspaceLabel}
            reason={reason}
            onSelect={() => {
              isDialogPendingRef.current = true;
            }}
          />
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={isScreenReaderMode}
            onCheckedChange={(checked) => onScreenReaderModeChange(checked === true)}
          >
            {screenReaderModeLabel}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <AlertDialogContent
          // Radix focuses Cancel with `preventScroll`; a dialog shorter than its content (320x200) must scroll
          // it into view, which a plain focus() does. Radix's handler is skipped after preventDefault.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          // Esc, Cancel, Reset and a close by a stop all end on the trigger (AC11), whatever Radix recorded.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <AlertDialogTitle>{resetDialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>{resetDialogDescription}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef}>{cancelLabel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onReset}>
              {resetConfirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * A menu item that stays focusable while unavailable (R1): `aria-disabled` with its reason as the description,
 * never Radix's `disabled`, which roving focus skips. Selecting it then does nothing and keeps the menu open.
 */
function ActionItem({
  label,
  reason,
  onSelect,
}: {
  label: string;
  reason: string | null;
  onSelect(): void;
}): ReactElement {
  const reasonId = useId();
  if (reason === null) {
    return <DropdownMenuItem onSelect={onSelect}>{label}</DropdownMenuItem>;
  }
  return (
    <DropdownMenuItem
      aria-disabled="true"
      aria-describedby={reasonId}
      onSelect={(event) => event.preventDefault()}
    >
      <span className="flex flex-col">
        {label}
        <span id={reasonId} aria-hidden className="text-xs text-muted-foreground">
          {reason}
        </span>
      </span>
    </DropdownMenuItem>
  );
}
