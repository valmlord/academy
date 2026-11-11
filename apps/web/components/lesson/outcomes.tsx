"use client";

import { type ReactElement, useState } from "react";
import { Button } from "@/components/ui/button";
import { collapsibleTriggerClassName } from "@/components/ui/collapsible";
import { collapseOutcomesLabel, outcomesHeading, showAllOutcomesLabel } from "@/lib/copy";

const MORE_ID = "outcomes-more";
// lesson-environment.md F7.1: the list collapses only with more than two outcomes.
const MAX_SHOWN_IN_FULL = 2;

// design/pages/lesson F7.1, `#state-outcomes-collapsed` / `-expanded`. Not the Radix Collapsible: the
// prototype keeps the second list in the DOM (`hidden`) and `aria-controls` on the button in both states,
// while Radix 1.2.1 sets aria-controls only while open and unmounts the closed content (design 8.4).
export function Outcomes({ outcomes }: { outcomes: string[] }): ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const isCollapsible = outcomes.length > MAX_SHOWN_IN_FULL;
  const [first, ...rest] = outcomes;
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-sm font-semibold">{outcomesHeading}</h2>
      {isCollapsible ? (
        <div className="flex flex-col gap-2">
          <OutcomeList items={first === undefined ? [] : [first]} />
          <OutcomeList id={MORE_ID} items={rest} hidden={!isExpanded} />
          <Button
            type="button"
            variant="link"
            aria-expanded={isExpanded}
            aria-controls={MORE_ID}
            className={`self-start ${collapsibleTriggerClassName}`}
            onClick={() => setIsExpanded((value) => !value)}
          >
            {isExpanded ? collapseOutcomesLabel : showAllOutcomesLabel}
          </Button>
        </div>
      ) : (
        <OutcomeList items={outcomes} />
      )}
    </div>
  );
}

function OutcomeList({
  items,
  id,
  hidden,
}: {
  items: string[];
  id?: string;
  hidden?: boolean;
}): ReactElement {
  return (
    <ul id={id} hidden={hidden} className="list-disc pl-6 text-sm [&>li+li]:mt-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
