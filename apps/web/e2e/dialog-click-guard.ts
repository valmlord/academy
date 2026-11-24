import type { Page } from "@playwright/test";

// React's click delegation listens on its root container, which is document because Next hydrates the whole
// document, and on every portal container, document.body for the dialog. A click stopped on window in the capture
// phase reaches neither, so no dialog button's onClick runs. The tests run on the owner's stack too, where Reset
// would replace a real working folder.

/** The clicks the guard saw inside an alertdialog, by the clicked button's text. */
export interface DialogClickRecord {
  blocked: string[];
  reachedDocument: string[];
}

const RECORD_PROPERTY = "__academyDialogClickGuard";

export class DialogClickGuardRecordError extends Error {
  constructor(property: string, detail: string) {
    super(`window.${property} ${detail}`);
    this.name = "DialogClickGuardRecordError";
  }
}

export async function installDialogClickGuard(page: Page): Promise<void> {
  await page.addInitScript((property) => {
    const record: DialogClickRecord = { blocked: [], reachedDocument: [] };
    Object.defineProperty(window, property, { value: record });
    const dialogClickLabel = (event: Event): string | null => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('[role="alertdialog"]') === null)
        return null;
      return (target.closest("button") ?? target).textContent?.trim() ?? "";
    };
    window.addEventListener(
      "click",
      (event) => {
        const label = dialogClickLabel(event);
        if (label === null) return;
        event.stopImmediatePropagation();
        event.preventDefault();
        record.blocked.push(label);
      },
      { capture: true },
    );
    // Fires only when the guard let a click through to where React listens.
    document.addEventListener(
      "click",
      (event) => {
        const label = dialogClickLabel(event);
        if (label !== null) record.reachedDocument.push(label);
      },
      { capture: true },
    );
  }, RECORD_PROPERTY);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export async function readDialogClickGuard(page: Page): Promise<DialogClickRecord> {
  const raw = await page.evaluate(
    (property): unknown => Reflect.get(window, property),
    RECORD_PROPERTY,
  );
  if (raw === undefined) {
    throw new DialogClickGuardRecordError(
      RECORD_PROPERTY,
      "is not set: installDialogClickGuard must run before goto",
    );
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("blocked" in raw) ||
    !("reachedDocument" in raw) ||
    !isStringArray(raw.blocked) ||
    !isStringArray(raw.reachedDocument)
  ) {
    throw new DialogClickGuardRecordError(
      RECORD_PROPERTY,
      `is not a dialog click record: ${JSON.stringify(raw)}`,
    );
  }
  return { blocked: raw.blocked, reachedDocument: raw.reachedDocument };
}
