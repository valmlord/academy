"use client";

import { cn } from "cn";
import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";
import { progressIndicatorClassName, progressTrackClassName } from "./progress-styles";

// The indicator's width is the share of max (proto `width: --progress-value`), not the registry's
// translateX of a 0-100 value, which is wrong for any other max. The accessible value is the caller's
// text (the "N of M" copy), set here through getValueLabel because a function prop cannot cross from a server
// component; Radix's default would announce a percentage.
function Progress({
  className,
  value,
  max,
  valueText,
  ...props
}: Omit<React.ComponentProps<typeof ProgressPrimitive.Root>, "value" | "max" | "getValueLabel"> & {
  value: number;
  max: number;
  valueText: string;
}): React.JSX.Element {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      getValueLabel={() => valueText}
      className={cn(progressTrackClassName, className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={progressIndicatorClassName}
        style={{ width: `${(value / max) * 100}%` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
