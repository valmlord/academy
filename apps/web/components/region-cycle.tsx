"use client";

import { useEffect } from "react";

// design/flows/ia.md R3: F6 / Shift+F6, and Ctrl+Shift+. / Ctrl+Shift+, as the fallback chord (matched
// by KeyboardEvent.code, so the Russian layout works), move focus between the regions marked
// data-region: the top bar, the notifications wrapper only while it is a region, then main. Focus
// lands on the region's first focusable element, or on the region itself when it has none.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function regions(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-region]")).filter((region) => {
    if (region.closest("[hidden]") !== null) return false;
    return !region.hasAttribute("data-notifications") || region.getAttribute("role") === "region";
  });
}

function focusInto(region: HTMLElement): void {
  const first = Array.from(region.querySelectorAll<HTMLElement>(FOCUSABLE)).find(
    (element) => element.closest("[hidden]") === null,
  );
  if (first !== undefined) {
    first.focus();
    return;
  }
  if (!region.hasAttribute("tabindex")) region.setAttribute("tabindex", "-1");
  region.focus();
}

/** +1 for the next region, -1 for the previous one, 0 for any other key. */
export function regionStep(event: KeyboardEvent): -1 | 0 | 1 {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return 0;
    if (event.code === "Period") return 1;
    if (event.code === "Comma") return -1;
    return 0;
  }
  if (event.key !== "F6") return 0;
  return event.shiftKey ? -1 : 1;
}

/** Moves focus `step` regions on from the one holding focus (from outside every region: the first). */
export function cycleRegion(step: -1 | 1): void {
  const all = regions();
  if (all.length === 0) return;
  const active = document.activeElement;
  const current = all.findIndex((region) => active !== null && region.contains(active));
  const next =
    current === -1 ? (step === 1 ? 0 : all.length - 1) : (current + step + all.length) % all.length;
  const target = all[next];
  if (target !== undefined) focusInto(target);
}

export function RegionCycle(): null {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const step = regionStep(event);
      if (step === 0) return;
      event.preventDefault();
      // A focused widget with its own keydown listener (xterm's textarea) would otherwise still receive the key
      // and send it on: F6 would reach the shell as `ESC [17~` while focus moves away.
      event.stopPropagation();
      cycleRegion(step);
    }
    // Capture phase on window, so the cycle runs before the key reaches any element's own listener.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
  return null;
}
