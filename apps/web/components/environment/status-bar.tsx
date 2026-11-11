"use client";

import Link from "next/link";
import { Fragment, type ReactElement, type ReactNode, useEffect, useId, useState } from "react";
import { StatusIcon } from "@/components/status-icon";
import { Button } from "@/components/ui/button";
import { collapsibleTriggerClassName } from "@/components/ui/collapsible";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import {
  detailsLabel,
  type KeyHintPart,
  regionKeyHintMacParts,
  regionKeyHintParts,
} from "@/lib/copy";
import type { StatusView } from "./status-view";

// design/system/proto.css `.env-statusbar`: the status with its icon or spinner and the start timer, the actions
// (the status action, the details disclosure, the actions menu), the error code and the key hint (prototype.html
// F8.1, F8.4). The status span keeps only the text and the note, so every textContent read of it stays the same.

export interface StatusBarProps {
  view: StatusView | null;
  /** The course page, where the rejected state's action leads. */
  courseHref: string;
  hintId: string;
  isMac: boolean;
  onAct(): void;
  actionsMenu: ReactNode;
}

export function StatusBar({
  view,
  courseHref,
  hintId,
  isMac,
  onAct,
  actionsMenu,
}: StatusBarProps): ReactElement {
  const detailsId = useId();
  const code = view?.detailsCode ?? null;
  // Collapsed again whenever the code changes, so a new error never opens already expanded.
  const [details, setDetails] = useState<{ code: string | null; isExpanded: boolean }>({
    code,
    isExpanded: false,
  });
  if (details.code !== code) setDetails({ code, isExpanded: false });
  const isExpanded = details.code === code && details.isExpanded;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-4 py-2 text-sm text-card-foreground">
      <div className="flex min-w-0 flex-[1_1_16rem] items-start gap-2">
        {view?.startedAt != null ? (
          // Not a second `status`: ui/spinner.tsx defaults to role="status", and the region holds one status only.
          <Spinner role={undefined} aria-label={undefined} aria-hidden className="mt-0.5" />
        ) : view?.icon != null ? (
          <StatusIcon kind={view.icon} />
        ) : null}
        {/* aria-live, not only the role: the menu and the dialog are modal and hide every branch of the page but
            [aria-live] ones (ia.md R2), and a stop while they are open must still be announced. */}
        <span role="status" aria-live="polite" className="flex flex-col">
          {view === null ? null : <StatusText view={view} />}
        </span>
        {view?.startedAt != null ? <StartTimer startedAt={view.startedAt} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {view?.action == null ? null : view.action.kind === "act" ? (
          <Button type="button" size="sm" data-status-action onClick={onAct}>
            {view.action.label}
          </Button>
        ) : (
          <Button asChild size="sm" data-status-action>
            <Link href={courseHref}>{view.action.label}</Link>
          </Button>
        )}
        {code === null ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            className={collapsibleTriggerClassName}
            onClick={() => setDetails({ code, isExpanded: !isExpanded })}
          >
            {detailsLabel}
          </Button>
        )}
        {actionsMenu}
      </div>
      {code === null ? null : (
        <pre
          id={detailsId}
          hidden={!isExpanded}
          className="basis-full rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap text-foreground wrap-anywhere"
        >
          {code}
        </pre>
      )}
      <p
        id={hintId}
        hidden={view?.isHintShown !== true}
        className="basis-full text-xs text-muted-foreground"
      >
        <KeyHint parts={isMac ? regionKeyHintMacParts : regionKeyHintParts} />
      </p>
    </div>
  );
}

function StatusText({ view }: { view: StatusView }): ReactElement {
  return (
    <>
      <span>{view.text}</span>
      {view.note === null ? null : <span className="text-muted-foreground">{view.note}</span>}
    </>
  );
}

/**
 * No whitespace between the parts: the hint's textContent is exactly the copy string (e2e E-hint). The parts are
 * a constant list, so their index is a stable key.
 */
function KeyHint({ parts }: { parts: readonly KeyHintPart[] }): ReactElement {
  return (
    <>
      {parts.map((part, index) =>
        part.kind === "key" ? (
          <Kbd key={index}>{part.text}</Kbd>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/** M:SS since `startedAt` (`performance.now()` time), as the prototype's `.timer`. */
function StartTimer({ startedAt }: { startedAt: number }): ReactElement {
  const [seconds, setSeconds] = useState(() => elapsedSeconds(startedAt));
  useEffect(() => {
    setSeconds(elapsedSeconds(startedAt));
    const id = setInterval(() => setSeconds(elapsedSeconds(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return (
    <span role="timer" className="text-muted-foreground tabular-nums">
      {`${minutes}:${rest}`}
    </span>
  );
}

function elapsedSeconds(startedAt: number): number {
  return Math.max(0, Math.floor((performance.now() - startedAt) / 1000));
}
