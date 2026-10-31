import { cn } from "cn";
import { Slot } from "radix-ui";
import type * as React from "react";

// Mirrors design/system/proto.css `.breadcrumb`. The registry's English default label is removed, so a
// page that forgets its label fails visibly instead of shipping "breadcrumb"; the page passes
// the label from lib/copy.ts. The current crumb is a plain span with aria-current (ia.md: not a link), without the
// registry's role="link" aria-disabled pair (lesson AC5: every aria-disabled control has a reason).
// Separators are "/" as in the prototype's `li + li::before`, hidden from the reading. The link's hover fade
// names its properties, as `Item` does, so the focus ring appears at once.

function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">): React.JSX.Element {
  return <nav data-slot="breadcrumb" className={cn(className)} {...props} />;
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">): React.JSX.Element {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">): React.JSX.Element {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center", className)}
      {...props}
    />
  );
}

function BreadcrumbLink({
  asChild,
  className,
  ...props
}: React.ComponentProps<"a"> & { asChild?: boolean }): React.JSX.Element {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="breadcrumb-link"
      className={cn(
        "text-muted-foreground underline underline-offset-[0.2em] transition-[background-color,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:text-foreground hover:decoration-2 motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn("text-foreground", className)}
      {...props}
    />
  );
}

function BreadcrumbSeparator({
  className,
  ...props
}: React.ComponentProps<"li">): React.JSX.Element {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("text-muted-foreground", className)}
      {...props}
    >
      /
    </li>
  );
}

export {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
};
