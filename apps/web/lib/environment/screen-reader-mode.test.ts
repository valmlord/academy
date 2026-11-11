import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readScreenReaderMode,
  SCREEN_READER_MODE_KEY,
  writeScreenReaderMode,
} from "./screen-reader-mode";

// The remembered screen reader mode (D7): only the exact "on" counts, and storage that is missing, blocked or
// full never throws out of the read or the write.

/** A storage whose reads or writes throw the DOMException a browser throws. */
class ThrowingStorage implements Storage {
  readonly length = 0;
  readonly #getError: DOMException | null;
  readonly #setError: DOMException | null;

  constructor(errors: { get?: DOMException; set?: DOMException }) {
    this.#getError = errors.get ?? null;
    this.#setError = errors.set ?? null;
  }

  clear(): void {}

  getItem(_key: string): string | null {
    if (this.#getError !== null) throw this.#getError;
    return null;
  }

  key(_index: number): string | null {
    return null;
  }

  removeItem(_key: string): void {}

  setItem(_key: string, _value: string): void {
    if (this.#setError !== null) throw this.#setError;
  }
}

const securityError = (): DOMException => new DOMException("storage is blocked", "SecurityError");
const blockedStorage = (): Storage => {
  throw securityError();
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("readScreenReaderMode", () => {
  it("reads off from empty storage", () => {
    expect(readScreenReaderMode(() => localStorage)).toBe(false);
  });

  it("reads on from a stored on", () => {
    localStorage.setItem(SCREEN_READER_MODE_KEY, "on");

    expect(readScreenReaderMode(() => localStorage)).toBe(true);
  });

  it.each(["off", "true", "ON", ""])("reads off from a stored %j", (value) => {
    localStorage.setItem(SCREEN_READER_MODE_KEY, value);

    expect(readScreenReaderMode(() => localStorage)).toBe(false);
  });

  it("reads off without throwing when the storage getter itself throws", () => {
    expect(() => readScreenReaderMode(blockedStorage)).not.toThrow();
    expect(readScreenReaderMode(blockedStorage)).toBe(false);
  });

  it("reads off without throwing when getItem throws", () => {
    const storage = new ThrowingStorage({ get: securityError() });

    expect(() => readScreenReaderMode(() => storage)).not.toThrow();
    expect(readScreenReaderMode(() => storage)).toBe(false);
  });
});

describe("writeScreenReaderMode", () => {
  it("stores on and off under the key, and a read after each write agrees", () => {
    const savedOn = writeScreenReaderMode(() => localStorage, true);
    const storedOn = localStorage.getItem(SCREEN_READER_MODE_KEY);
    const readOn = readScreenReaderMode(() => localStorage);
    const savedOff = writeScreenReaderMode(() => localStorage, false);
    const storedOff = localStorage.getItem(SCREEN_READER_MODE_KEY);
    const readOff = readScreenReaderMode(() => localStorage);

    expect([savedOn, storedOn, readOn]).toEqual([true, "on", true]);
    expect([savedOff, storedOff, readOff]).toEqual([true, "off", false]);
  });

  it("answers not saved without throwing when the storage is full", () => {
    const storage = new ThrowingStorage({
      set: new DOMException("quota exceeded", "QuotaExceededError"),
    });

    expect(() => writeScreenReaderMode(() => storage, true)).not.toThrow();
    expect(writeScreenReaderMode(() => storage, true)).toBe(false);
  });

  it("answers not saved without throwing when the storage getter itself throws", () => {
    expect(() => writeScreenReaderMode(blockedStorage, true)).not.toThrow();
    expect(writeScreenReaderMode(blockedStorage, true)).toBe(false);
  });
});
