// Mirrors design/system/proto.css `.progress` and `.progress-indicator`. A plain module, so both the client
// Progress and the server-rendered decorative module bars get the class strings themselves (a constant
// exported from a "use client" file would arrive in a server component as a client reference).
export const progressTrackClassName =
  "relative block h-2 w-full overflow-hidden rounded-full border border-input bg-secondary";
export const progressIndicatorClassName =
  "block h-full bg-primary transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";
