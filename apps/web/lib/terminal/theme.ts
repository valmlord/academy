// The xterm theme from the design tokens (design 3.6.1 "Theme", ADR-0006). The values pass unchanged: xterm
// parses `oklch(...)` through a canvas, which jsdom lacks, so the real colour path is checked by E-theme.

/** The 21 colour keys of xterm's `ITheme` the terminal sets; named here so this module imports nothing. */
export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

/** Theme key -> custom property in design/system/tokens.css. */
export const TERMINAL_THEME_TOKENS: Readonly<Record<keyof TerminalTheme, string>> = {
  background: "--terminal",
  foreground: "--terminal-foreground",
  cursor: "--terminal-cursor",
  cursorAccent: "--terminal-cursor-accent",
  selectionBackground: "--terminal-selection",
  black: "--terminal-ansi-black",
  red: "--terminal-ansi-red",
  green: "--terminal-ansi-green",
  yellow: "--terminal-ansi-yellow",
  blue: "--terminal-ansi-blue",
  magenta: "--terminal-ansi-magenta",
  cyan: "--terminal-ansi-cyan",
  white: "--terminal-ansi-white",
  brightBlack: "--terminal-ansi-bright-black",
  brightRed: "--terminal-ansi-bright-red",
  brightGreen: "--terminal-ansi-bright-green",
  brightYellow: "--terminal-ansi-bright-yellow",
  brightBlue: "--terminal-ansi-bright-blue",
  brightMagenta: "--terminal-ansi-bright-magenta",
  brightCyan: "--terminal-ansi-bright-cyan",
  brightWhite: "--terminal-ansi-bright-white",
};

/**
 * `readToken` returns a custom property's computed value, e.g.
 * `(name) => getComputedStyle(document.documentElement).getPropertyValue(name)`; values are trimmed.
 */
export function terminalTheme(readToken: (name: string) => string): TerminalTheme {
  const color = (key: keyof TerminalTheme): string => readToken(TERMINAL_THEME_TOKENS[key]).trim();
  return {
    background: color("background"),
    foreground: color("foreground"),
    cursor: color("cursor"),
    cursorAccent: color("cursorAccent"),
    selectionBackground: color("selectionBackground"),
    black: color("black"),
    red: color("red"),
    green: color("green"),
    yellow: color("yellow"),
    blue: color("blue"),
    magenta: color("magenta"),
    cyan: color("cyan"),
    white: color("white"),
    brightBlack: color("brightBlack"),
    brightRed: color("brightRed"),
    brightGreen: color("brightGreen"),
    brightYellow: color("brightYellow"),
    brightBlue: color("brightBlue"),
    brightMagenta: color("brightMagenta"),
    brightCyan: color("brightCyan"),
    brightWhite: color("brightWhite"),
  };
}
