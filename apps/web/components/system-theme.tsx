"use client";

import { useLayoutEffect } from "react";
import { DARK_SCHEME_QUERY } from "@/lib/theme-script";

/**
 * The theme script's rule for a document the client renders from scratch. When a page's notFound() escapes
 * every Suspense boundary, the server's HTML render fails and Next sends `<html id="__next_error__">`, whose
 * head lacks the root layout's script; the client then mounts the root layout with createRoot. The <script>
 * React inserts there never runs, and mounting <html> removes every attribute it had. A layout effect runs
 * after that mount and before the browser paints it, so the rendered page is never painted without the class.
 */
export function SystemTheme(): null {
  useLayoutEffect(() => {
    const query = window.matchMedia(DARK_SCHEME_QUERY);
    const apply = (): void => {
      document.documentElement.classList.toggle("dark", query.matches);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return null;
}
