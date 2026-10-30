import { cn } from "cn";
import { Slot } from "radix-ui";
import type * as React from "react";

// Mirrors design/system/proto.css `.item-group` and `.item`: a plain list whose rows are separated by a
// top border, each row one link (`li > a.item`, lesson rows and dashboard module rows). Hover is the opaque
// accent pair; focus is the global ring, so the registry's ring and outline utilities are removed (a
// utility would win over the base layer). The hover fade names its properties: `transition-colors` also
// animates `outline-color`, so the ring would fade in on keyboard focus. No size or variant: the prototype
// has one look. The title is not clamped, because long Russian titles must wrap at 375px.

function ItemGroup({ className, ...props }: React.ComponentProps<"ul">): React.JSX.Element {
  return <ul data-slot="item-group" className={cn("flex flex-col", className)} {...props} />;
}

function Item({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }): React.JSX.Element {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="item"
      className={cn(
        "flex w-full items-center gap-4 rounded-md border border-transparent px-4 py-3 text-foreground no-underline transition-[background-color,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none [a]:hover:bg-accent [a]:hover:text-accent-foreground [li+li>&]:rounded-none [li+li>&]:border-t-border",
        className,
      )}
      {...props}
    />
  );
}

function ItemContent({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element {
  return (
    <span
      data-slot="item-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-1", className)}
      {...props}
    />
  );
}

function ItemTitle({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element {
  return <span data-slot="item-title" className={cn("font-medium", className)} {...props} />;
}

function ItemDescription({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element {
  return (
    <span
      data-slot="item-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function ItemActions({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element {
  return (
    <span
      data-slot="item-actions"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

export { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle };
