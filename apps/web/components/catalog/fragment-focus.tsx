"use client";

import { useEffect } from "react";

// Catalog AC2: arriving with `#<moduleId>`, changing the hash, or clicking a module link (the hash may
// already be that one, so no hashchange fires) focuses that module's heading and scrolls it into view.
// The hash is untrusted input: a malformed escape does nothing, and the id is looked up with
// getElementById, never handed to a selector.

function headingOf(hash: string): HTMLElement | null {
  if (hash.length <= 1) return null;
  let id: string;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    // A malformed escape (e.g. `#%E0%A4`) names no module.
    return null;
  }
  return document.getElementById(`${id}-heading`);
}

function focusHeading(hash: string): void {
  const heading = headingOf(hash);
  if (heading === null) return;
  heading.focus();
  heading.scrollIntoView();
}

export function FragmentFocus(): null {
  useEffect(() => {
    focusHeading(window.location.hash);
    function onHashChange(): void {
      focusHeading(window.location.hash);
    }
    function onClick(event: MouseEvent): void {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
      if (link !== null) focusHeading(link.hash);
    }
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}
