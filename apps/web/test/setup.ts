import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without globals, so Testing Library cannot register its own cleanup: unmount here, or
// every render of a file stays in the document for the next test.
afterEach(() => {
  cleanup();
});
