// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AllowlistEntry,
  findUnguardedEntryPoints,
  InvalidAllowlistEntryError,
  readSourceFiles,
  type SourceFile,
} from "./entry-guard";

const USE_SERVER = '"use server";';

function file(path: string, ...lines: string[]): SourceFile {
  return { path, source: lines.join("\n") };
}

function unguarded(files: SourceFile[], allowlist: AllowlistEntry[] = []): string[] {
  return findUnguardedEntryPoints(files, allowlist).map(
    ({ path, problem }) => `${path}: ${problem}`,
  );
}

describe("findUnguardedEntryPoints: entry points and exports", () => {
  it("lists a page without a data access layer call", () => {
    const page = file(
      "app/x/page.tsx",
      "export default async function Page() {",
      "  return null;",
      "}",
    );

    expect(unguarded([page])).toEqual(["app/x/page.tsx: no data access layer call"]);
  });

  it("lists the second export of a server action module when only the first is guarded", () => {
    const actions = file(
      "app/x/actions.ts",
      USE_SERVER,
      "export async function a() {",
      "  await requireSession('/');",
      "}",
      "export async function b() {}",
    );

    expect(unguarded([actions])).toEqual([
      "app/x/actions.ts: export b has no data access layer call",
    ]);
  });

  it("lists a route handler whose POST has no call", () => {
    const route = file(
      "app/api/x/route.ts",
      "export async function GET() {",
      "  await getSession();",
      "}",
      "export const POST = async () => null;",
    );

    expect(unguarded([route])).toEqual([
      "app/api/x/route.ts: export POST has no data access layer call",
    ]);
  });

  it.each([
    ["only a re-export", [USE_SERVER, "async function x() {}", "export { x };"], "app/a.ts"],
    [
      "a guarded export next to a re-export",
      [USE_SERVER, "export async function a() {", "  await getSession();", "}", "export { b };"],
      "app/a.ts",
    ],
    [
      "a wrapped handler next to a guarded one",
      [
        "export async function GET() {",
        "  await getSession();",
        "}",
        "export const POST = wrap(handler);",
      ],
      "app/r/route.ts",
    ],
  ])("lists %s as an unrecognised export", (_label, lines, path) => {
    expect(unguarded([file(path, ...lines)])).toEqual([
      expect.stringMatching(new RegExp(`^${path}: unrecognised export: export`)),
    ]);
  });

  it("accepts route segment config and type exports next to guarded functions", () => {
    const route = file(
      "app/r/route.ts",
      'export const dynamic = "force-dynamic";',
      "export async function GET() {",
      "  await getSession();",
      "}",
    );
    const actions = file(
      "app/a.ts",
      USE_SERVER,
      "export type T = string;",
      "export async function a() {",
      "  await getSession();",
      "}",
    );

    expect(unguarded([route, actions])).toEqual([]);
  });

  it("lists an inline server action in a page without quoting the directive", () => {
    const page = file(
      "app/x/page.tsx",
      "export default async function Page() {",
      "  await requireSession('/');",
      "  async function act() {",
      `    ${USE_SERVER}`,
      "  }",
      "  return null;",
      "}",
    );

    const problems = unguarded([page]);

    expect(problems).toEqual([
      "app/x/page.tsx: inline server action: move it to an actions module",
    ]);
    expect(problems.join("\n")).not.toMatch(/use server/);
  });

  it("does not count a call that is only in a comment", () => {
    const page = file(
      "app/x/page.tsx",
      "// await requireSession('/');",
      "export default async function Page() {",
      "  /* getSession() */",
      "  return null;",
      "}",
    );

    expect(unguarded([page])).toEqual(["app/x/page.tsx: no data access layer call"]);
  });
});

describe("findUnguardedEntryPoints: allowlist", () => {
  const actions = file(
    "app/x/actions.ts",
    USE_SERVER,
    "export async function a() {}",
    "export async function b() {}",
  );

  it("exempts a page named by a file entry", () => {
    const page = file("app/p/page.tsx", "export default function Page() {}");

    expect(unguarded([page], [{ entry: "app/p/page.tsx", reason: "public" }])).toEqual([]);
  });

  it("exempts only the named export of a server action module", () => {
    const allowlist = [{ entry: "app/x/actions.ts#a", reason: "public" }];

    expect(unguarded([actions], allowlist)).toEqual([
      "app/x/actions.ts: export b has no data access layer call",
    ]);
  });

  it.each([
    ["an empty reason", { entry: "app/x/actions.ts#a", reason: "  " }, /the reason is empty/],
    ["a missing file", { entry: "app/gone.ts#a", reason: "r" }, /no such entry point/],
    ["a missing export", { entry: "app/x/actions.ts#gone", reason: "r" }, /no such export/],
    [
      "a file entry for a server action module",
      { entry: "app/x/actions.ts", reason: "r" },
      /exempted per export/,
    ],
  ])("refuses %s", (_label, entry, message) => {
    expect(() => findUnguardedEntryPoints([actions], [entry])).toThrow(InvalidAllowlistEntryError);
    expect(() => findUnguardedEntryPoints([actions], [entry])).toThrow(message);
  });
});

describe("readSourceFiles", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  function tree(files: Record<string, string>): string {
    const created = mkdtempSync(join(tmpdir(), "entry-guard-"));
    root = created;
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(dirname(join(created, path)), { recursive: true });
      writeFileSync(join(created, path), source);
    }
    return created;
  }

  it("reads every directory but the skipped ones, and js pages and route segments named test", () => {
    const unguardedPage = "export default function Page() {}";
    const action = `${USE_SERVER}\nexport async function x() {}`;
    const created = tree({
      "actions/x.ts": action,
      "app/x/page.jsx": unguardedPage,
      "app/test/page.tsx": unguardedPage,
      "node_modules/m/a.ts": action,
      "lib/node_modules/m/a.ts": action,
      ".next/server/a.js": action,
      "e2e/a.ts": action,
      "test/a.ts": action,
      "lib/y.test.ts": action,
    });

    const paths = unguarded(readSourceFiles(created)).sort();

    expect(paths).toEqual([
      "actions/x.ts: export x has no data access layer call",
      "app/test/page.tsx: no data access layer call",
      "app/x/page.jsx: no data access layer call",
    ]);
  });
});
