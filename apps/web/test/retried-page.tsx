import { act } from "@testing-library/react";
import { type ReactElement, use, useState } from "react";

// A retried page whose refresh answer the test holds. router.refresh runs inside RetryButton's transition, so
// the state update to a pending answer suspends that transition: React keeps the old view committed and the
// button's isPending true until the test releases the answer, as Next does until the refresh's payload is in.
// Releasing commits the queued view together with isPending=false, then the takers' passive effects run. That
// gap is where a test moves focus "before the answer".

type RetriedPageState =
  | { kind: "shown"; view: ReactElement }
  | { kind: "held"; answer: Promise<ReactElement> };

let setPageState: (state: RetriedPageState) => void = () => undefined;
let queuedAnswer: ReactElement | null = null;
let resolveHeldAnswer: ((view: ReactElement) => void) | null = null;

/** Thrown when a retry is pressed with no answer queued: the test would otherwise hold a refresh forever. */
export class RetryAnswerNotQueuedError extends Error {
  constructor() {
    super("retry pressed with no answer queued; call queueRetryAnswer before the press");
    this.name = "RetryAnswerNotQueuedError";
  }
}

export function RetriedPage({ initial }: { initial: ReactElement }): ReactElement {
  const [state, setState] = useState<RetriedPageState>({ kind: "shown", view: initial });
  setPageState = setState;
  return state.kind === "shown" ? state.view : use(state.answer);
}

/** Stores the view the next retry answers with. */
export function queueRetryAnswer(next: ReactElement): void {
  queuedAnswer = next;
}

/** The test's `router.refresh`: holds the answer until releaseRetryAnswer. */
export function refreshRetriedPage(): void {
  if (queuedAnswer === null) throw new RetryAnswerNotQueuedError();
  const answer = new Promise<ReactElement>((resolve) => {
    resolveHeldAnswer = resolve;
  });
  setPageState({ kind: "held", answer });
}

/** Lets a held refresh answer with the queued view and waits for its commit and the takers' effects. */
export async function releaseRetryAnswer(): Promise<void> {
  const resolve = resolveHeldAnswer;
  const answer = queuedAnswer;
  resolveHeldAnswer = null;
  queuedAnswer = null;
  await act(async () => {
    if (resolve !== null && answer !== null) resolve(answer);
  });
}
