import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import * as React from "react";

const alertVariants = cva(
  // Mirrors design/system/proto.css `.alert` and `.alert > .status-icon`: the icon is one text-sm line
  // (1.25rem) and spans the title, description and actions rows. The registry's `[&_a]:*` link utilities
  // on the title and description are removed: a link in an Alert is a plain `a` in the prototype, so it
  // takes `inlineLinkClassName`, which those descendant selectors would outrank.
  "group/alert relative grid w-full gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-left text-sm has-[>svg]:grid-cols-[auto_1fr] *:[svg]:row-span-3 *:[svg]:mt-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        // design/system "Alert": the border and the title carry the status colour, the description
        // stays muted; the icon shape differs per status (never colour alone).
        destructive:
          "border-destructive bg-card text-card-foreground *:data-[slot=alert-title]:text-destructive *:[svg]:text-destructive",
        warning: "border-warning bg-card text-card-foreground *:[svg]:text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("font-semibold group-has-[>svg]/alert:col-start-2", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-muted-foreground group-has-[>svg]/alert:col-start-2 [&_p:not(:last-child)]:mb-4",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
