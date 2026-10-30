"use client";

import { cn } from "cn";
import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";

// Mirrors design/system/proto.css `.tabs`, `.tabs-list`, `.tabs-trigger`, `.tabs-content`. Unselected
// triggers use muted-foreground, never a translucent foreground (README: no opacity on text). The selected
// trigger has the background, a 1px muted-foreground border and the prototype's --shadow-sm, written per
// theme as card.tsx does; the README rejects dark border-input (2.757:1). Focus is the global ring: the
// registry's focus and outline utilities are removed, including outline-none on the panel, whose
// tabindex=0 makes it a Tab stop that must show the ring (WCAG 2.4.7). No line variant, underline bar,
// icons or vertical layout: no #30 state uses them.

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>): React.JSX.Element {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex min-w-0 flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>): React.JSX.Element {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex w-fit flex-wrap items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>): React.JSX.Element {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md border border-transparent bg-transparent px-3 py-1 text-sm font-medium text-muted-foreground",
        "aria-selected:border-muted-foreground aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-[0_1px_2px_0_color-mix(in_oklab,var(--foreground)_8%,transparent)] dark:aria-selected:shadow-[0_1px_2px_0_color-mix(in_oklab,var(--background)_60%,transparent)]",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>): React.JSX.Element {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("min-w-0", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
