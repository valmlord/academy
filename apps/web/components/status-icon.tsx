import { cn } from "cn";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  InfoIcon,
  type LucideIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type * as React from "react";

// design/system/proto.css `.status-icon`: one icon per status, each a different shape, because colour is never
// the only signal; README "Custom pieces": the app draws them with lucide icons of the same meaning. Always
// `aria-hidden`: the word next to it carries the status. 1.25rem, the line height of the text-sm it sits by.
// Not mirrored: `chosen` (the quiz review mark, #36) and proto.css's forced-colours rule, which repaints CSS-drawn
// rings; a lucide SVG is stroked in currentColor, which forced colours already map to the system text colour.

export type StatusIconKind = "success" | "destructive" | "warning" | "muted" | "info";

const ICONS: Record<StatusIconKind, { icon: LucideIcon; className: string }> = {
  success: { icon: CircleCheckIcon, className: "text-success" },
  destructive: { icon: CircleXIcon, className: "text-destructive" },
  warning: { icon: TriangleAlertIcon, className: "text-warning" },
  muted: { icon: CircleDashedIcon, className: "text-muted-foreground" },
  info: { icon: InfoIcon, className: "text-info" },
};

export function StatusIcon({
  kind,
  className,
}: {
  kind: StatusIconKind;
  className?: string;
}): React.JSX.Element {
  const { icon: Icon, className: colour } = ICONS[kind];
  return (
    <Icon aria-hidden data-status={kind} className={cn("size-5 shrink-0", colour, className)} />
  );
}
