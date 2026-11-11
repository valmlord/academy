import { cn } from "cn";
import type * as React from "react";

// Mirrors design/system/proto.css `.scroll-area`: a native overflow box (README "ScrollArea", D6). Not Radix
// ScrollArea, whose viewport wraps the content in a `display: table` box that grows with wide content, so a
// table or code block would no longer scroll inside its own box. The caller adds the pane's `flex-1 p-4`.
function ScrollArea({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="scroll-area"
      className={cn("min-h-0 overflow-auto overscroll-contain", className)}
      {...props}
    />
  );
}

export { ScrollArea };
