import { cn } from "cn";
import type { ReactElement } from "react";
import {
  progressIndicatorClassName,
  progressTrackClassName,
} from "@/components/ui/progress-styles";

export interface ModuleBarProps {
  passed: number;
  total: number;
}

// design/pages/dashboard F18.2: a decorative bar inside a module row (`span.progress[aria-hidden]`); the
// row's "N of M lessons" text carries the value. A server component, so it uses the class strings, not the
// client Progress.
export function ModuleBar({ passed, total }: ModuleBarProps): ReactElement {
  const share = total === 0 ? 0 : passed / total;
  return (
    <span aria-hidden className={cn(progressTrackClassName, "mt-1")}>
      <span className={progressIndicatorClassName} style={{ width: `${share * 100}%` }} />
    </span>
  );
}
