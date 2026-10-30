import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";

// Mirrors design/system/proto.css `.badge`: no fixed height (22px from padding and the text-xs line), the
// radius-md corner, a 1px transparent border. Never interactive in #30, so no hover, focus or invalid
// styles; the registry's focus utilities would also override the global focus ring. Only the variants a
// #30 state uses are kept: secondary (module available), outline (lesson type) and outline with the
// muted tone (module being prepared, lesson not started; proto `[data-tone="muted"]`).
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border-border bg-transparent text-foreground",
      },
      tone: {
        default: "",
        muted: "text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "secondary",
      tone: "default",
    },
  },
);

function Badge({
  className,
  variant = "secondary",
  tone = "default",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>): React.JSX.Element {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      data-tone={tone === "muted" ? "muted" : undefined}
      className={cn(badgeVariants({ variant, tone }), className)}
      {...props}
    />
  );
}

export { Badge };
