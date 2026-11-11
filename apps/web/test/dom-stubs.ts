// Browser APIs jsdom lacks, for component tests that render the environment panel. Radix's menu and dialog in
// jsdom 30 need nothing more: IntersectionObserver and the pointer capture and scrollIntoView methods were
// stubbed once and removed again, because no test went red without them (#106 commit 6).

/** Records what it observes and whether it was disconnected; never calls back (jsdom has no layout). */
export class RecordingResizeObserver {
  static readonly instances: RecordingResizeObserver[] = [];
  readonly observed: Element[] = [];
  isDisconnected = false;

  constructor() {
    RecordingResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  unobserve(target: Element): void {
    const index = this.observed.indexOf(target);
    if (index !== -1) this.observed.splice(index, 1);
  }

  disconnect(): void {
    this.isDisconnected = true;
  }
}
