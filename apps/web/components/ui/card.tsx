import { cn } from "cn";
import * as React from "react";

// Mirrors design/system/proto.css `.card`: space-6 gap and padding, a 1px border plus its --shadow-sm
// (a foreground mix in light, a background mix in dark), not shadcn's ring. --shadow-sm is a
// prototype-only value, not a theme token. No overflow clip: it would cut the outside focus ring of a
// control at the card's edge. The README lists one Card variant, so there is no size.
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-(--card-spacing) rounded-xl border bg-card py-(--card-spacing) text-card-foreground shadow-[0_1px_2px_0_color-mix(in_oklab,var(--foreground)_8%,transparent)] dark:shadow-[0_1px_2px_0_color-mix(in_oklab,var(--background)_60%,transparent)] [--card-spacing:--spacing(6)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 px-(--card-spacing)", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-title" className={cn("text-lg font-semibold", className)} {...props} />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-(--card-spacing)", className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex flex-wrap items-center gap-2 px-(--card-spacing)", className)}
      {...props}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
