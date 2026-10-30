import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The scanner behind U-guard (ADR-0008 item 8): every page, route handler and server action module of
// apps/web must call the data access layer, unless an allowlist entry with a reason exempts it. A regex
// scan, a guardrail against an honest omission, not a parser: a non-exported helper placed between two
// exports counts towards the earlier one, which only code review catches.

export interface SourceFile {
  /** Relative to apps/web, with forward slashes. */
  path: string;
  source: string;
}

export interface AllowlistEntry {
  /** `<file>` (a page or route handler) or `<file>#<exportName>`. */
  entry: string;
  reason: string;
}

export interface UnguardedEntryPoint {
  path: string;
  problem: string;
}

export type EntryPointKind = "page" | "route" | "actions";

/** An allowlist entry that is stale, unexplained or broader than its file allows. */
export class InvalidAllowlistEntryError extends Error {
  constructor(entry: string, rule: string) {
    super(`allowlist entry ${JSON.stringify(entry)}: ${rule}`);
    this.name = "InvalidAllowlistEntryError";
  }
}

const PAGE = /^app\/(?:.+\/)?page\.(?:tsx|ts|jsx|js)$/;
const ROUTE = /^app\/(?:.+\/)?route\.(?:ts|js)$/;
// Written with \x20 so this module's own source never contains the directive it looks for.
const DIRECTIVE = /["']use\x20server["']/;
const LEADING_DIRECTIVE = /^\s*["']use\x20server["']/;
// Strings first, so a "//" inside a string is not taken for a comment; block comments keep their line
// breaks, so the export lines that follow keep their positions.
const COMMENT_OR_STRING =
  /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const EXPORT_LINE = /^\s*export\b/;
const FUNCTION_EXPORT =
  /^\s*export\s+(default\s+)?(?:async\s+)?function\b\s*\*?\s*([A-Za-z_$][\w$]*)?/;
const CONST_FUNCTION_EXPORT =
  /^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\(|function\b)/;
// Erased by the compiler: no runtime entry point.
const TYPE_EXPORT = /^\s*export\s+(?:type|interface)\b/;
// Next's route segment config: read at build time, never served.
const SEGMENT_CONFIG =
  /^\s*export\s+const\s+(?:dynamic|revalidate|runtime|preferredRegion|maxDuration|fetchCache|dynamicParams)\s*=/;
const DAL_CALL = /\b(?:requireSession|getSession)\s*\(/;

function stripComments(source: string): string {
  return source.replace(COMMENT_OR_STRING, (match: string, literal: string | undefined) =>
    literal !== undefined ? literal : match.replace(/[^\n]/g, ""),
  );
}

/** Which kind of entry point a file is, or null when Next never serves it. */
export function entryPointKind(file: SourceFile): EntryPointKind | null {
  if (PAGE.test(file.path)) return "page";
  if (ROUTE.test(file.path)) return "route";
  return DIRECTIVE.test(stripComments(file.source)) ? "actions" : null;
}

interface ExportSegment {
  /** The export's name; null for an erased or segment-config export, which needs no check. */
  name: string | null;
  recognised: boolean;
  line: string;
  body: string;
}

// Each export statement owns the source up to the next one. Biome keeps one statement per line, so an
// export never hides behind another statement on the same line.
function exportSegments(stripped: string, isRoute: boolean): ExportSegment[] {
  const lines = stripped.split("\n");
  const starts = lines.flatMap((line, index) => (EXPORT_LINE.test(line) ? [index] : []));
  return starts.map((start, position) => {
    const line = lines[start] ?? "";
    const body = lines.slice(start, starts[position + 1] ?? lines.length).join("\n");
    if (TYPE_EXPORT.test(line) || (isRoute && SEGMENT_CONFIG.test(line))) {
      return { name: null, recognised: true, line, body };
    }
    const declared = FUNCTION_EXPORT.exec(line);
    if (declared !== null) {
      const name = declared[1] !== undefined ? "default" : (declared[2] ?? "default");
      return { name, recognised: true, line, body };
    }
    const assigned = CONST_FUNCTION_EXPORT.exec(line);
    if (assigned !== null) return { name: assigned[1] ?? null, recognised: true, line, body };
    return { name: null, recognised: false, line, body };
  });
}

function hasInlineDirective(stripped: string, kind: EntryPointKind): boolean {
  if (kind !== "actions") return DIRECTIVE.test(stripped);
  const leading = LEADING_DIRECTIVE.exec(stripped);
  if (leading === null) return true;
  return DIRECTIVE.test(stripped.slice(leading[0].length));
}

interface AnalysedFile {
  path: string;
  kind: EntryPointKind;
  stripped: string;
  segments: ExportSegment[];
}

function analyse(file: SourceFile): AnalysedFile | null {
  const kind = entryPointKind(file);
  if (kind === null) return null;
  const stripped = stripComments(file.source);
  return { path: file.path, kind, stripped, segments: exportSegments(stripped, kind === "route") };
}

// The exempt files, and per file the exempt export names.
interface Exemptions {
  files: Set<string>;
  exports: Map<string, Set<string>>;
}

function readAllowlist(allowlist: AllowlistEntry[], analysed: AnalysedFile[]): Exemptions {
  const byPath = new Map(analysed.map((file) => [file.path, file]));
  const exemptions: Exemptions = { files: new Set(), exports: new Map() };
  for (const { entry, reason } of allowlist) {
    if (reason.trim() === "") throw new InvalidAllowlistEntryError(entry, "the reason is empty");
    const [path = "", exportName] = entry.split("#");
    const file = byPath.get(path);
    if (file === undefined) throw new InvalidAllowlistEntryError(entry, "no such entry point");
    if (exportName === undefined) {
      if (file.kind === "actions") {
        throw new InvalidAllowlistEntryError(
          entry,
          "a server action module is exempted per export",
        );
      }
      exemptions.files.add(path);
      continue;
    }
    if (!file.segments.some((segment) => segment.name === exportName)) {
      throw new InvalidAllowlistEntryError(entry, "no such export");
    }
    const names = exemptions.exports.get(path) ?? new Set<string>();
    exemptions.exports.set(path, names.add(exportName));
  }
  return exemptions;
}

function problemsOf(file: AnalysedFile, exemptions: Exemptions): string[] {
  const problems: string[] = [];
  // Checked before any exemption: a per-function check is out of reach for a regex scan.
  if (hasInlineDirective(file.stripped, file.kind)) {
    problems.push("inline server action: move it to an actions module");
  }
  if (exemptions.files.has(file.path)) return problems;
  if (file.kind === "page") {
    if (!DAL_CALL.test(file.stripped)) problems.push("no data access layer call");
    return problems;
  }
  const exempt = exemptions.exports.get(file.path) ?? new Set<string>();
  for (const segment of file.segments) {
    if (!segment.recognised) problems.push(`unrecognised export: ${segment.line.trim()}`);
    else if (segment.name !== null && !exempt.has(segment.name) && !DAL_CALL.test(segment.body)) {
      problems.push(`export ${segment.name} has no data access layer call`);
    }
  }
  return problems;
}

/** Every entry point of `files` that does not call the data access layer, with what is missing. */
export function findUnguardedEntryPoints(
  files: SourceFile[],
  allowlist: AllowlistEntry[],
): UnguardedEntryPoint[] {
  const analysed = files.flatMap((file) => analyse(file) ?? []);
  const exemptions = readAllowlist(allowlist, analysed);
  return analysed.flatMap((file) =>
    problemsOf(file, exemptions).map((problem) => ({ path: file.path, problem })),
  );
}

// Next serves .js and .jsx pages too (allowJs is on), so they are read like TypeScript.
const SOURCE_FILE = /\.(?:tsx|ts|jsx|js|mjs|cjs)$/;
const TEST_FILE = /\.test\.(?:tsx|ts|jsx|js|mjs|cjs)$/;
// Never entry points at any depth.
const SKIPPED_ANYWHERE = new Set(["node_modules", ".next"]);
// Skipped only at the root of apps/web: a route segment named test or e2e (app/test/page.tsx) is live.
const SKIPPED_AT_ROOT = new Set(["e2e", "test"]);

/** Every source file under `root` that may be an entry point, with paths relative to it. */
export function readSourceFiles(root: string, relative = ""): SourceFile[] {
  return readdirSync(join(root, relative), { withFileTypes: true }).flatMap((dirent) => {
    const path = relative === "" ? dirent.name : `${relative}/${dirent.name}`;
    if (dirent.isDirectory()) {
      const skipped =
        SKIPPED_ANYWHERE.has(dirent.name) || (relative === "" && SKIPPED_AT_ROOT.has(dirent.name));
      return skipped ? [] : readSourceFiles(root, path);
    }
    if (!dirent.isFile() || !SOURCE_FILE.test(dirent.name) || TEST_FILE.test(dirent.name))
      return [];
    return [{ path, source: readFileSync(join(root, path), "utf8") }];
  });
}
