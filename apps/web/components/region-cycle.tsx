"use client";

import { useEffect } from "react";

// design/flows/ia.md R3: F6 / Shift+F6, and Ctrl+Shift+. / Ctrl+Shift+, as the fallback chord (matched
// by KeyboardEvent.code, so the Russian layout works), move focus between the regions marked
// data-region: the top bar, the notifications wrapper only while it is a region, then main. Focus
// lands on the region's first focusable element, or on the region itself when it has none.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dispatched (bubbling) on a lesson pane the layout hides, before the cycle focuses into it; `detail.pane` is the
 * pane's `data-pane` value. The lesson layout shows that pane synchronously, so the focus that follows lands.
 */
export const SHOW_PANE_EVENT = "academy:show-pane";

/**
 * Whether the element is drawn: no `hidden` ancestor, no `display: none` on it or an ancestor, and not
 * `visibility: hidden` itself. Computed style rather than layout boxes, because jsdom has no layout but honours
 * inline styles in getComputedStyle.
 */
export function isRendered(element: Element): boolean {
  if (element.closest("[hidden]") !== null) return false;
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (getComputedStyle(node).display === "none") return false;
  }
  return getComputedStyle(element).visibility !== "hidden";
}

function regions(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-region]")).filter((region) => {
    if (region.closest("[hidden]") !== null) return false;
    if (region.hasAttribute("data-notifications") && region.getAttribute("role") !== "region") {
      return false;
    }
    // A pane the one-pane layout hides is still a stop (R3): reaching it shows it.
    return region.hasAttribute("data-pane") || isRendered(region);
  });
}

/**
 * Focuses the region's first drawn focusable element that is not a roving `tabindex="-1"` (the unselected switch
 * tab), or the region itself when it has none.
 */
export function focusInto(region: HTMLElement): void {
  const first = Array.from(region.querySelectorAll<HTMLElement>(FOCUSABLE)).find(
    (element) => element.getAttribute("tabindex") !== "-1" && isRendered(element),
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

/**
 * The region `step` stops from the focused one. From outside every region (the split handle) the nearest region
 * in document order in that direction, as proto.js does; from nothing or the page body, the first or the last.
 */
function targetRegion(all: HTMLElement[], step: -1 | 1): HTMLElement | undefined {
  const active = document.activeElement;
  const current = all.findIndex((region) => active !== null && region.contains(active));
  if (current !== -1) return all[(current + step + all.length) % all.length];
  if (active === null || active === document.body) return step === 1 ? all[0] : all.at(-1);
  const following = all.filter(
    (region) => (active.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  );
  if (step === 1) return following[0] ?? all[0];
  const preceding = all.filter((region) => !following.includes(region));
  return preceding.at(-1) ?? all.at(-1);
}

/** Moves focus `step` regions on from the one holding focus, showing a hidden lesson pane first. */
export function cycleRegion(step: -1 | 1): void {
  const all = regions();
  if (all.length === 0) return;
  const target = targetRegion(all, step);
  if (target === undefined) return;
  const pane = target.getAttribute("data-pane");
  if (pane !== null && !isRendered(target)) {
    target.dispatchEvent(new CustomEvent(SHOW_PANE_EVENT, { bubbles: true, detail: { pane } }));
  }
  focusInto(target);
}

/**
 * Whether a modal layer owns the keys: an open alert dialog, or focus inside a menu. Radix keeps focus trapped
 * there, so a cycle would be pulled straight back; the learner closes the layer first (Esc).
 */
function isModalLayerOpen(): boolean {
  if (document.querySelector('[role="alertdialog"]') !== null) return true;
  return document.activeElement?.closest('[role="menu"]') != null;
}

export function RegionCycle(): null {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const step = regionStep(event);
      if (step === 0) return;
      event.preventDefault();
      if (isModalLayerOpen()) return;
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
