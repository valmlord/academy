"use client";

import { cn } from "cn";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import type * as React from "react";
import { buttonVariants } from "@/components/ui/button";

// Mirrors design/system/proto.css `dialog.alert-dialog`, `.alert-dialog-title`, `.alert-dialog-description`,
// `.alert-dialog-footer`, plus what the prototype's `<dialog>` takes from `showModal()` and the UA stylesheet
// (#106 design 2.7): centred by `inset: 0; margin: auto`, at most `100% - 6px - 2em` in both directions and
// scrolling inside itself, so at 320x200 the footer stays reachable. z-70 stands in for the top layer: above
// the tooltip (z-60) and the menus (z-50). The scrim is proto.css `--scrim` per theme. No open or close motion
// (README "Motion and reduced motion"), so the registry's animate and zoom classes are left out.

function AlertDialog(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Root>,
): React.JSX.Element {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay
        data-slot="alert-dialog-overlay"
        className="fixed inset-0 z-70 bg-[color-mix(in_oklab,var(--foreground)_50%,transparent)] dark:bg-[color-mix(in_oklab,var(--background)_70%,transparent)]"
      />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "fixed inset-0 z-70 m-auto h-fit max-h-[calc(100%-6px-2em)] w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100%-6px-2em)] overflow-y-auto rounded-lg border bg-background p-6 text-foreground shadow-[0_4px_12px_-2px_color-mix(in_oklab,var(--foreground)_14%,transparent)] dark:shadow-[0_4px_12px_-2px_color-mix(in_oklab,var(--background)_80%,transparent)]",
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("mt-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("mt-6 flex flex-wrap justify-end gap-2", className)}
      {...props}
    />
  );
}

type ButtonVariant = "default" | "outline" | "destructive";

function AlertDialogAction({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  variant?: ButtonVariant;
}): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  );
}

// The prototype's Cancel is an outline button with the initial focus. Radix focuses it with `preventScroll`;
// a caller that needs it scrolled into view (a dialog shorter than its content) focuses it itself.
function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
};
