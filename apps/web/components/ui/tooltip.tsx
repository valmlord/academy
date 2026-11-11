"use client";

import { type FocusEvent, type KeyboardEvent, useEffect, useId, useState } from "react";

// design/system/README.md "Tooltip" and proto.css `.tooltip-anchor`, `.tooltip`, written in the app (D6) rather
// than taken from Radix: the description must be tied by a permanent `aria-describedby` (Radix adds it only while
// open), and the tip sits inside its anchor, so the pointer can cross the gap onto it without leaving the anchor.
// Opens on hover and on keyboard focus, stays while hovered, Esc closes it without moving focus (WCAG 1.4.13); a
// pointer press closes it, so a click's focus never pins it open.

export interface TooltipAnchorProps {
  "aria-describedby": string;
  onPointerEnter(): void;
  onPointerLeave(event: { currentTarget: Element }): void;
  onPointerDown(): void;
  onFocus(event: FocusEvent<Element>): void;
  onBlur(): void;
  onKeyDown(event: KeyboardEvent<Element>): void;
}

export interface TooltipTipProps {
  id: string;
  role: "tooltip";
  hidden: boolean;
  "data-side": "right";
  className: string;
}

export interface Tooltip {
  isOpen: boolean;
  anchorProps: TooltipAnchorProps;
  tipProps: TooltipTipProps;
}

// proto.css `.tooltip[data-side="right"]` and its `::before` bridge over the space-2 gap to the anchor.
const TIP_CLASS_NAME =
  "absolute top-1/2 left-[calc(100%+0.5rem)] z-60 w-max max-w-64 -translate-y-1/2 rounded-md bg-foreground px-3 py-1.5 text-xs text-background before:absolute before:inset-y-0 before:right-full before:w-2 before:content-['']";

/** Only keyboard focus keeps the tip open once the pointer leaves (README "Tooltip"). */
function isKeyboardFocused(element: Element): boolean {
  return element === document.activeElement && element.matches(":focus-visible");
}

/** Props for the anchor, which is also the trigger, and for the tip rendered inside it. */
export function useTooltip(): Tooltip {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  // Esc closes an open tip wherever focus is, as proto.js's document listener does: a tip opened by hover while
  // focus sits elsewhere must be dismissable without moving the pointer or the focus (WCAG 1.4.13).
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);
  return {
    isOpen,
    anchorProps: {
      "aria-describedby": id,
      onPointerEnter: () => setIsOpen(true),
      onPointerLeave: (event) => {
        if (!isKeyboardFocused(event.currentTarget)) setIsOpen(false);
      },
      onPointerDown: () => setIsOpen(false),
      onFocus: (event) => {
        if (event.currentTarget.matches(":focus-visible")) setIsOpen(true);
      },
      onBlur: () => setIsOpen(false),
      onKeyDown: (event) => {
        if (event.key === "Escape") setIsOpen(false);
      },
    },
    tipProps: {
      id,
      role: "tooltip",
      hidden: !isOpen,
      "data-side": "right",
      className: TIP_CLASS_NAME,
    },
  };
}
