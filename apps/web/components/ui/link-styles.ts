// Mirrors design/system/proto.css `a` and `a:hover`: underlined text in the surrounding colour, a 2px
// decoration on hover. Tailwind's preflight removes the underline, so every text link names it. A plain
// module, not a client one, so server components get the string itself.
export const inlineLinkClassName =
  "text-foreground underline underline-offset-[0.2em] hover:decoration-2";

// Mirrors design/system/proto.css `.heading-link > a`: a heading's whole text as one link, in the heading's
// colour, size and weight, with the inline link's underline and hover.
export const headingLinkClassName =
  "inline-block max-w-full text-inherit underline underline-offset-[0.2em] hover:decoration-2";
