// Mirrors design/system/proto.css `.collapsible-trigger`: the chevron after the label turns when the trigger is
// expanded. Only `transform` is transitioned, so the focus ring never animates. The disclosure itself is the
// app's pattern (`aria-expanded`, `aria-controls`, a `hidden` target; components/lesson/outcomes.tsx says why
// not the Radix Collapsible), so this module holds only the trigger's classes.
export const collapsibleTriggerClassName =
  "inline-flex items-center gap-1.5 after:size-1.5 after:rotate-45 after:border-r-2 after:border-b-2 after:border-current after:transition-transform after:duration-150 after:ease-[cubic-bezier(0.2,0,0,1)] aria-expanded:after:-rotate-[135deg] motion-reduce:after:transition-none";
