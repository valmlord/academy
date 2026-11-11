import { cn } from "cn";
import type * as React from "react";

// Mirrors design/system/proto.css `.kbd`. The registry's `pointer-events-none select-none h-5` and its tooltip
// slot rules are left out: proto.css has none of them, and the key names stay selectable text.
function Kbd({ className, ...props }: React.ComponentProps<"kbd">): React.JSX.Element {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex min-w-5 items-center rounded-sm border bg-muted px-1 font-mono text-xs leading-5 text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
