import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";
import * as React from "react";

// Mirrors design/system/proto.css `.button`. Hover fills are opaque mixes or tokens, never alpha, and
// disabled / aria-disabled use the muted pair instead of opacity: the README forbids opacity on a
// container with text, because it lowers the measured contrast. aria-disabled (R1: the busy sign-in
// button) stays muted on hover because Tailwind orders the aria-disabled variant after hover. With
// aria-busy the cursor is progress, which proto.css intends for a busy button; there its
// `[aria-disabled="true"]:hover` rule (0,3,0) outranks `[aria-busy="true"]` (0,2,0), so the prototype
// shows not-allowed. The app shows progress deliberately (prototype bug, DESIGN note).
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent text-sm font-medium whitespace-nowrap no-underline transition-[background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground aria-disabled:cursor-not-allowed aria-disabled:border-border aria-disabled:bg-muted aria-disabled:text-muted-foreground aria-busy:aria-disabled:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--primary)_90%,var(--background))]",
        outline:
          "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
        ghost: "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        // Solid in both themes; the hover mixes with foreground (README, "destructive-foreground").
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-[color-mix(in_oklab,var(--destructive)_90%,var(--foreground))]",
        link: "bg-transparent text-foreground underline underline-offset-[0.2em] hover:decoration-2 data-[variant=link]:px-0",
      },
      // README "Controls": default 2.25rem, small 2rem, icon a 2.25rem square; no other size exists.
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
