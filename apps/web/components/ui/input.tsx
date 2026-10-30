import { cn } from "cn";
import * as React from "react";

// Mirrors design/system/proto.css `.input`. text-base at every width: 16px keeps iOS Safari from
// zooming on focus, and an iPad is wider than md (README, "Type scale"). The fill is the opaque
// `background` in both themes and disabled uses the muted pair, never opacity: a translucent surface
// under text has no measured contrast (README, "Dark-mode rules").
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1.5 text-base text-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
