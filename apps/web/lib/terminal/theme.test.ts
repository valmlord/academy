// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TERMINAL_THEME_TOKENS, terminalTheme } from "./theme";

// U-theme (design 10.3): every xterm theme key comes from its token in the app's own token block
// (app/globals.css, a verbatim copy of design/system/tokens.css), and none is empty.

const XTERM_THEME_KEY_COUNT = 21;
const globalsCss = readFileSync(path.join(import.meta.dirname, "../../app/globals.css"), "utf8");

/** The first declaration of each custom property in globals.css (the light theme). */
function tokenReader(css: string): (name: string) => string {
  const values = new Map<string, string>();
  for (const match of css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined && !values.has(name)) values.set(name, value);
  }
  return (name) => values.get(name) ?? "";
}

describe("terminalTheme (U-theme)", () => {
  it("maps all 21 xterm theme keys from the named tokens, none empty", () => {
    const readToken = tokenReader(globalsCss);

    const theme = terminalTheme(readToken);

    expect(Object.keys(theme)).toHaveLength(XTERM_THEME_KEY_COUNT);
    const expected = Object.fromEntries(
      Object.entries(TERMINAL_THEME_TOKENS).map(([key, token]) => [key, readToken(token).trim()]),
    );
    expect(theme).toEqual(expected);
    for (const [key, value] of Object.entries(theme)) expect(value, key).not.toBe("");
    expect(theme.background).toBe("oklch(0.18 0 0)");
    expect(theme.brightWhite).toBe("#ffffff");
  });

  it("passes the computed value trimmed, as getPropertyValue returns it with a leading space", () => {
    const theme = terminalTheme((name) => (name === "--terminal" ? " oklch(0.2 0 0) " : "#000"));

    expect(theme.background).toBe("oklch(0.2 0 0)");
  });
});
