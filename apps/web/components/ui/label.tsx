"use client";

import { cn } from "cn";
import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";

// Mirrors design/system/proto.css `.label` (text-sm with its own line height, weight 500); a disabled
// control's label turns muted-foreground, not translucent (README, "Dark-mode rules").
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
