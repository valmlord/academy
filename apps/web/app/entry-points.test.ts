// @vitest-environment node
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AllowlistEntry,
  entryPointKind,
  findUnguardedEntryPoints,
  readSourceFiles,
} from "@/lib/entry-guard";

// Every exemption from the data access layer rule (ADR-0008 item 8). A new entry needs a reason a
// reviewer can check; a server action module is exempted per export, never as a whole.
const ALLOWLIST: AllowlistEntry[] = [
  { entry: "app/sign-in/page.tsx", reason: "the sign-in page itself is public" },
  {
    entry: "app/sign-in/actions.ts#needsSeedHint",
    reason:
      "reveals only whether any user exists (sign-in AC5), by one existence query through getDb()",
  },
  {
    entry: "app/api/auth/[...all]/route.ts",
    reason: "Better Auth authenticates its own endpoints",
  },
];

const files = readSourceFiles(join(import.meta.dirname, ".."));

describe("entry points of apps/web", () => {
  it("scans at least one page, one route handler and one server action module", () => {
    const kinds = new Set(files.map(entryPointKind));

    expect(kinds).toEqual(new Set([null, "page", "route", "actions"]));
  });

  it("does not take the scanner or a test file for an entry point", () => {
    const entryPoints = files.filter((file) => entryPointKind(file) !== null).map((f) => f.path);

    expect(entryPoints).not.toContain("lib/entry-guard.ts");
    expect(entryPoints.filter((path) => path.includes(".test."))).toEqual([]);
  });

  it("finds every entry point calling the data access layer or allowlisted", () => {
    expect(findUnguardedEntryPoints(files, ALLOWLIST)).toEqual([]);
  });
});
