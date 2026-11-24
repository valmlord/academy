"use client";

import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

// README "Scrollable code" (WCAG 2.1.1): the pre becomes a Tab stop, a group and named while it scrolls
// sideways, and keeps all three while it holds focus after it fits. Overflow is known only after layout, so
// the server markup has none of the three and the first client render matches it; the decision runs after mount.
export function ScrollableCode({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  const preRef = useRef<HTMLPreElement>(null);
  const [isScrollStop, setIsScrollStop] = useState(false);

  const decide = useCallback((): void => {
    const pre = preRef.current;
    if (pre === null) return;
    const isOverflowing = pre.scrollWidth > pre.clientWidth;
    const isFocused = document.activeElement === pre;
    // A focused pre that stops overflowing keeps its stop until it loses focus, so fitting does not drop focus
    // to body.
    setIsScrollStop((current) => isOverflowing || (current && isFocused));
  }, []);

  // The observer reruns the decision whenever the pre's box changes; a tab panel shown again remounts the
  // component. Its first notification after observe() makes the initial decision.
  useEffect(() => {
    const pre = preRef.current;
    if (pre === null) return;
    const observer = new ResizeObserver(decide);
    observer.observe(pre);
    return () => observer.disconnect();
  }, [decide]);

  return (
    <pre
      ref={preRef}
      onBlur={decide}
      tabIndex={isScrollStop ? 0 : undefined}
      role={isScrollStop ? "group" : undefined}
      aria-label={isScrollStop ? label : undefined}
    >
      {children}
    </pre>
  );
}
