// Mirrors design/system/proto.css `a` and `a:hover`: underlined text in the surrounding colour, a 2px
// decoration on hover. Tailwind's preflight removes the underline, so every text link names it. A plain
// module, not a client one, so server components get the string itself.
export const inlineLinkClassName =
  "text-foreground underline underline-offset-[0.2em] hover:decoration-2";
