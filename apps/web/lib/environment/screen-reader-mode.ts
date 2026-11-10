// The terminal's screen reader mode is remembered per browser, for every lesson (D7). Storage can be missing or
// blocked, so every access is guarded and the page works without it; what is stored is untrusted input.

/** One key for every lesson; the `academy:` prefix of the app's window events. */
export const SCREEN_READER_MODE_KEY = "academy:screen-reader-mode";

const ON = "on";
const OFF = "off";

/** Only the exact stored `"on"` turns the mode on; a missing key, another value or no storage reads as off. */
export function readScreenReaderMode(getStorage: () => Storage): boolean {
  try {
    return getStorage().getItem(SCREEN_READER_MODE_KEY) === ON;
  } catch {
    // The `localStorage` getter throws a SecurityError where the browser blocks storage, and getItem can throw
    // too: either way the mode starts off, the design's default.
    return false;
  }
}

/** True when the choice was saved. Not saved, the mode still applies to this page; nothing is logged. */
export function writeScreenReaderMode(getStorage: () => Storage, isOn: boolean): boolean {
  try {
    getStorage().setItem(SCREEN_READER_MODE_KEY, isOn ? ON : OFF);
    return true;
  } catch {
    // Quota exceeded, storage disabled or blocked: a browser setting, not an incident.
    return false;
  }
}
