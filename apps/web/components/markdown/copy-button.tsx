"use client";

import { type ReactElement, useState } from "react";
import { Button } from "@/components/ui/button";
import { copyDeniedLabel, copyLabel } from "@/lib/copy";

// Lesson AC14: when the clipboard refuses, the button's text, and so its accessible name, changes to the
// denial; focus stays on the button. Success changes nothing (the design has no success label).
export function CopyButton({ text }: { text: string }): ReactElement {
  const [isDenied, setIsDenied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // A refused or missing clipboard has no detail worth keeping; the label tells the learner.
      setIsDenied(true);
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => void copy()}>
      {isDenied ? copyDeniedLabel : copyLabel}
    </Button>
  );
}
