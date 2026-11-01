#!/usr/bin/env python3
"""Check design deliverables against the design/dev contract (docs/adr/0006-design-dev-contract.md).

  design_tokens.py check <design-dir>   token shape and values, contrast pairs, prototype scan, flow ids
  design_tokens.py pair <fg> <bg>       contrast ratio of two colours, a translucent fg composited over bg

Exit codes: 0 clean; 1 findings (a missing tokens.css included); 2 usage error, an unparsable colour in
`pair`, or a tokens.css that cannot be parsed (unterminated comment, unbalanced braces).

Output lines: "contrast ok|contrast low <theme> <fg> on <bg>: <ratio>:1 (min <m>:1)", "INFO ...",
"ERROR <path>:<line>: <message>". No line starts with PASS, FAIL or VERDICT: judges paste this output into
review reports whose vote is the last line starting with one of them.

Known limits: named colour keywords (red, white) are not scanned, the judge-consistency agent reads for
them; a "--x:" declared in any .css file under the design dir counts as visible on every page, while
one declared in a page's <style> block or style="" attribute counts only for that page; outside srcset, a URL
starting with two backslashes is not flagged, because JavaScript strings hold "\\d" regex escapes.
"""
import math
import os
import re
import sys
from typing import Iterator, NamedTuple, Optional, Sequence

TOKENS_REL = os.path.join("system", "tokens.css")
FLOWS_DIR = "flows"
FLOW_REGISTRY = "ia.md"
SCANNED_SUFFIXES = (".html", ".css", ".js", ".svg")

ROOT, DARK, THEME = ":root", ".dark", "@theme inline"
CUSTOM_VARIANT = "@custom-variant dark (&:is(.dark *));"
EXPECTED_ITEMS = (CUSTOM_VARIANT, ROOT, DARK, THEME)

# The shadcn/ui default colour token set (ui.shadcn.com/docs/theming).
REQUIRED_COLOUR_TOKENS = (
    "background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary",
    "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent",
    "accent-foreground", "destructive", "border", "input", "ring",
)
# WCAG 2.2 SC 1.4.3 (text) and 1.4.11 (non-text: focus rings, control boundaries).
TEXT_MIN_RATIO = 4.5
NON_TEXT_MIN_RATIO = 3.0
NON_TEXT_PAIRS = (("ring", "background"), ("input", "background"), ("sidebar-ring", "sidebar"))
TEXT_PAIRS_EXTRA = (("muted-foreground", "background"), ("destructive", "background"))
INFO_PAIRS = (("border", "background"),)
# Linear sRGB slack for float error: a token outside it renders differently per display (gamut mapping
# differs between browsers), so its contrast is undefined.
GAMUT_EPSILON = 0.0001
CHANNEL_MAX = 255

NUM = r"[+-]?(?:\d+\.?\d*|\.\d+)"
OKLCH_RE = re.compile(r"oklch\(\s*(%s)(%%?)\s+(%s)\s+(%s)(?:deg)?\s*(?:/\s*(%s)(%%?)\s*)?\)" % (NUM, NUM, NUM, NUM),
                      re.I)
HEX_RE = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})")
DECL_RE = re.compile(r"\s*--([a-z0-9-]+)\s*:\s*(.*\S)\s*", re.S)
NON_COLOUR_RE = re.compile(r"-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%|ms|s|deg)?|calc\(.+\)|var\(--[a-z0-9-]+\)", re.S)
VAR_RE = re.compile(r"var\(\s*--([A-Za-z0-9_-]+)")
RAW_COLOUR_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b|\b(?:oklch|oklab|lab|lch|rgba?|hsla?|hwb|color)\(", re.I)
STYLE_BLOCK_RE = re.compile(r"(<style\b[^>]*>)(.*?)</style\s*>", re.I | re.S)
ATTR_VALUE = r"""\s*=\s*(?:"([^"]*)"|'([^']*)')"""
STYLE_ATTR_RE = re.compile(r"\bstyle" + ATTR_VALUE, re.I)
COLOUR_ATTR_RE = re.compile(r"\b(?:fill|stroke|color|stop-color)" + ATTR_VALUE, re.I)
# srcset is also matched unquoted: candidates then carry no descriptors and only commas separate them.
SRCSET_RE = re.compile(r"""\b(?:srcset|imagesrcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))""", re.I)
ANCHOR_TAG_RE = re.compile(r"<a\b[^>]*>", re.I | re.S)
HREF_RE = re.compile(r"\bhref" + ATTR_VALUE, re.I)
XMLNS_RE = re.compile(r"\bxmlns(?::[A-Za-z0-9_-]+)?" + ATTR_VALUE)
XML_NAMESPACE_PREFIX = "http://www.w3.org/"
ABSOLUTE_URL_RE = re.compile(r"[A-Za-z][A-Za-z0-9+.-]*://")
URL_TAIL_RE = re.compile(r"""[^\s"'`()<>,;]*""")
# Browsers read a backslash as a slash in http(s) URLs, so "/\host" and "\/host" are protocol-relative too.
# A JavaScript "// comment" follows neither a quote, a backtick, a parenthesis nor "=".
PROTOCOL_RELATIVE_RE = re.compile(r"""["'`(=]\s*(?:/[/\\]|\\/)[A-Za-z0-9]""")
CANDIDATE_URL_RE = re.compile(r"/[/\\]|\\[/\\]|[A-Za-z][A-Za-z0-9+.-]*://")
FLOW_HEADING_RE = re.compile(r"^#{2,3}\s+F(\d+)\b", re.M)
FLOW_STEP_RE = re.compile(r"^\s*(?:[-*]|\d+\.)\s+\**F(\d+)\.(\d+)\b", re.M)
DATA_STEP_RE = re.compile(r"""\bdata-step\s*=\s*["']F(\d+)\.(\d+)["']""")

# OKLab -> LMS -> XYZ (D65) -> linear sRGB, copied from the CSS Color 4 sample code:
# https://www.w3.org/TR/css-color-4/#color-conversion-code (OKLab_to_XYZ, XYZ_to_lin_sRGB).
OKLAB_TO_LMS = (
    (1.0000000000000000, 0.3963377773761749, 0.2158037573099136),
    (1.0000000000000000, -0.1055613458156586, -0.0638541728258133),
    (1.0000000000000000, -0.0894841775298119, -1.2914855480194092),
)
LMS_TO_XYZ = (
    (1.2268798758459243, -0.5578149944602171, 0.2813910456659647),
    (-0.0405757452148008, 1.1122868032803170, -0.0717110580655164),
    (-0.0763729366746601, -0.4214933324022432, 1.5869240198367816),
)
XYZ_TO_LIN_SRGB = (
    (12831 / 3959, -329 / 214, -1974 / 3959),
    (-851781 / 878810, 1648619 / 878810, 36519 / 878810),
    (705 / 12673, -2585 / 12673, 705 / 667),
)

Vector = tuple[float, float, float]
Matrix = tuple[Vector, Vector, Vector]


class TokensParseError(ValueError):
    """tokens.css cannot be split into items: an unterminated comment or unbalanced braces."""


class ColourError(ValueError):
    """A value is not a colour this checker can parse (oklch() or #rgb/#rrggbb)."""


class Colour(NamedTuple):
    """Gamma-encoded sRGB channels in [0, 1] (unclamped), alpha in [0, 1], and the gamut verdict."""
    red: float
    green: float
    blue: float
    alpha: float
    in_gamut: bool


class Decl(NamedTuple):
    name: str
    value: str
    line: int


class Report:
    def __init__(self) -> None:
        self.lines: list[str] = []
        self.failed = False

    def error(self, path: str, line: int, message: str) -> None:
        self.lines.append("ERROR %s:%d: %s" % (path, line, message))
        self.failed = True

    def emit(self, text: str, failing: bool = False) -> None:
        self.lines.append(text)
        self.failed = self.failed or failing


def _mul(matrix: Matrix, vec: Vector) -> Vector:
    return (
        sum(m * v for m, v in zip(matrix[0], vec)),
        sum(m * v for m, v in zip(matrix[1], vec)),
        sum(m * v for m, v in zip(matrix[2], vec)),
    )


def _gamma_encode(channel: float) -> float:
    """sRGB transfer function, extended to negative values by reflection (CSS Color 4, gam_sRGB)."""
    sign = -1.0 if channel < 0 else 1.0
    magnitude = abs(channel)
    if magnitude > 0.0031308:
        return sign * (1.055 * math.pow(magnitude, 1 / 2.4) - 0.055)
    return 12.92 * channel


def oklch_to_linear_srgb(lightness: float, chroma: float, hue_degrees: float) -> Vector:
    hue = math.radians(hue_degrees)
    lms_nonlinear = _mul(OKLAB_TO_LMS, (lightness, chroma * math.cos(hue), chroma * math.sin(hue)))
    lms = (lms_nonlinear[0] ** 3, lms_nonlinear[1] ** 3, lms_nonlinear[2] ** 3)
    return _mul(XYZ_TO_LIN_SRGB, _mul(LMS_TO_XYZ, lms))


def _number(text: str, percent: str, percent_scale: float) -> float:
    return float(text) / 100 * percent_scale if percent else float(text)


def parse_colour(value: str) -> Colour:
    text = value.strip()
    m = OKLCH_RE.fullmatch(text)
    if m:
        lightness = _number(m.group(1), m.group(2), 1.0)
        alpha = _number(m.group(5), m.group(6), 1.0) if m.group(5) is not None else 1.0
        linear = oklch_to_linear_srgb(lightness, float(m.group(3)), float(m.group(4)))
        in_gamut = all(-GAMUT_EPSILON <= c <= 1 + GAMUT_EPSILON for c in linear)
        red, green, blue = (_gamma_encode(c) for c in linear)
        return Colour(red, green, blue, min(max(alpha, 0.0), 1.0), in_gamut)
    m = HEX_RE.fullmatch(text)
    if m:
        digits = m.group(1)
        if len(digits) == 3:
            digits = "".join(d * 2 for d in digits)
        red, green, blue = (int(digits[i:i + 2], 16) / CHANNEL_MAX for i in (0, 2, 4))
        return Colour(red, green, blue, 1.0, True)
    raise ColourError("%r is not oklch(L C H[ / A]) or #rgb/#rrggbb" % value)


def srgb8(colour: Colour) -> tuple[int, int, int]:
    """The 8-bit sRGB a browser renders for an opaque colour (clamped, rounded)."""
    return (_quantize(colour.red), _quantize(colour.green), _quantize(colour.blue))


def _quantize(channel: float) -> int:
    return int(round(min(max(channel, 0.0), 1.0) * CHANNEL_MAX))


def _relative_luminance(rgb8: tuple[int, int, int]) -> float:
    def linearize(channel: int) -> float:
        c = channel / CHANNEL_MAX
        return c / 12.92 if c <= 0.04045 else math.pow((c + 0.055) / 1.055, 2.4)
    red, green, blue = (linearize(c) for c in rgb8)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast_ratio(fg: Colour, bg: Colour) -> float:
    """WCAG 2.2 contrast of fg over an opaque bg; a translucent fg is composited in encoded space."""
    if bg.alpha < 1:
        raise ColourError("the background is translucent; contrast needs an opaque surface")
    def over(front: float, back: float) -> float:
        return front * fg.alpha + back * (1 - fg.alpha)
    shown = Colour(over(fg.red, bg.red), over(fg.green, bg.green), over(fg.blue, bg.blue), 1.0, fg.in_gamut)
    lighter, darker = sorted((_relative_luminance(srgb8(shown)), _relative_luminance(srgb8(bg))), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def _line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def strip_comments(text: str, strict: bool) -> str:
    """/* */ comments replaced by spaces, newlines kept, so offsets and line numbers stay valid."""
    out: list[str] = []
    pos = 0
    while True:
        start = text.find("/*", pos)
        if start < 0:
            out.append(text[pos:])
            return "".join(out)
        end = text.find("*/", start + 2)
        if end < 0:
            if strict:
                raise TokensParseError("unterminated comment at line %d" % _line_of(text, start))
            end = len(text) - 2
        out.append(text[pos:start])
        out.append(re.sub(r"[^\n]", " ", text[start:end + 2]))
        pos = end + 2


class Item(NamedTuple):
    prelude: str
    body: Optional[str]
    body_offset: int
    line: int


def split_top_level(text: str) -> list[Item]:
    items: list[Item] = []
    depth, start, body_start = 0, 0, 0
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                body_start = i + 1
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth < 0:
                raise TokensParseError("unbalanced '}' at line %d" % _line_of(text, i))
            if depth == 0:
                prelude = text[start:body_start - 1]
                items.append(Item(" ".join(prelude.split()), text[body_start:i], body_start,
                                  _line_of(text, start + len(prelude) - len(prelude.lstrip()))))
                start = i + 1
        elif ch == ";" and depth == 0:
            raw = text[start:i + 1]
            items.append(Item(" ".join(raw.split()), None, 0, _line_of(text, start + len(raw) - len(raw.lstrip()))))
            start = i + 1
    if depth != 0:
        raise TokensParseError("unbalanced '{' (%d left open)" % depth)
    if text[start:].strip():
        raise TokensParseError("text after the last rule at line %d" % _line_of(text, start))
    return items


def _declarations(text: str, item: Item, path: str, report: Report) -> list[Decl]:
    decls: list[Decl] = []
    body = item.body or ""
    offset = 0
    for part in body.split(";"):
        part_offset = item.body_offset + offset
        offset += len(part) + 1
        if not part.strip():
            continue
        line = _line_of(text, part_offset + len(part) - len(part.lstrip()))
        m = DECL_RE.fullmatch(part)
        if not m:
            report.error(path, line, "%s may hold only --name: value; declarations, not %r"
                         % (item.prelude, " ".join(part.split())))
            continue
        decls.append(Decl(m.group(1), " ".join(m.group(2).split()), line))
    return decls


class Tokens(NamedTuple):
    themes: dict[str, dict[str, Decl]]
    theme_inline: dict[str, Decl]


def _is_colour_value(value: str) -> bool:
    return value.lower().startswith("oklch(") or value.startswith("#")


def parse_tokens(path: str, report: Report) -> Tokens:
    with open(path, encoding="utf-8") as fh:
        text = strip_comments(fh.read(), strict=True)
    items = split_top_level(text)
    blocks: dict[str, list[Decl]] = {}
    expected = list(EXPECTED_ITEMS)
    for item in items:
        name = item.prelude
        if expected and name == expected[0] and (item.body is None) == (name == CUSTOM_VARIANT):
            expected.pop(0)
            if item.body is not None:
                blocks[name] = _declarations(text, item, path, report)
            continue
        report.error(path, item.line, "unexpected top-level item %r; tokens.css holds exactly %s, in that order"
                     % (name, ", ".join(EXPECTED_ITEMS)))
    for missing in expected:
        report.error(path, 1, "missing top-level item %r" % missing)
    themes = {theme: {d.name: d for d in blocks.get(theme, [])} for theme in (ROOT, DARK)}
    return Tokens(themes, {d.name: d for d in blocks.get(THEME, [])})


def check_tokens(path: str, tokens: Tokens, report: Report) -> dict[str, dict[str, Colour]]:
    colours: dict[str, dict[str, Colour]] = {ROOT: {}, DARK: {}}
    colour_names: dict[str, set[str]] = {ROOT: set(), DARK: set()}
    for theme, decls in tokens.themes.items():
        for decl in decls.values():
            if _is_colour_value(decl.value):
                colour_names[theme].add(decl.name)
                try:
                    colour = parse_colour(decl.value)
                except ColourError as err:
                    report.error(path, decl.line, "%s --%s: %s" % (theme, decl.name, err))
                    continue
                if not colour.in_gamut:
                    report.error(path, decl.line, "%s --%s: %s is out of sRGB gamut" % (theme, decl.name, decl.value))
                colours[theme][decl.name] = colour
            elif not NON_COLOUR_RE.fullmatch(decl.value):
                report.error(path, decl.line, "%s --%s: %r is neither a colour (oklch() or hex) nor a length, "
                             "number, calc() or var()" % (theme, decl.name, decl.value))
    for name in REQUIRED_COLOUR_TOKENS:
        present = [theme for theme in (ROOT, DARK) if name in tokens.themes[theme]]
        if not present:
            report.error(path, 1, "required token --%s missing in :root and .dark" % name)
            continue
        for theme in (ROOT, DARK):
            if theme not in present:
                report.error(path, 1, "required token --%s missing in %s" % (name, theme))
            elif name not in colour_names[theme]:
                report.error(path, tokens.themes[theme][name].line, "required token --%s in %s is not a colour"
                             % (name, theme))
    for theme, other in ((ROOT, DARK), (DARK, ROOT)):
        for name in sorted(colour_names[theme] - colour_names[other]):
            report.error(path, tokens.themes[theme][name].line,
                         "colour token --%s has no colour value in %s" % (name, other))
    for name in sorted(colour_names[ROOT] | colour_names[DARK]):
        mapping = tokens.theme_inline.get("color-" + name)
        if mapping is None or mapping.value != "var(--%s)" % name:
            report.error(path, 1, "colour token --%s needs --color-%s: var(--%s) in @theme inline" % (name, name, name))
    defined = set(tokens.themes[ROOT]) | set(tokens.themes[DARK])
    for decl in tokens.theme_inline.values():
        for ref in VAR_RE.findall(decl.value):
            if ref not in defined:
                report.error(path, decl.line, "@theme inline --%s refers to --%s, which :root and .dark do not define"
                             % (decl.name, ref))
    radius = tokens.themes[ROOT].get("radius")
    if radius is None or _is_colour_value(radius.value):
        report.error(path, 1, "--radius must be a non-colour token in :root")
    return colours


def check_pairs(path: str, tokens: Tokens, colours: dict[str, dict[str, Colour]], report: Report) -> None:
    for theme in (ROOT, DARK):
        theme_colours = colours[theme]
        text_pairs = [(name, name[:-len("-foreground")]) for name in sorted(theme_colours)
                      if name.endswith("-foreground")]
        rules = ([(fg, bg, TEXT_MIN_RATIO) for fg, bg in text_pairs + list(TEXT_PAIRS_EXTRA)]
                 + [(fg, bg, NON_TEXT_MIN_RATIO) for fg, bg in NON_TEXT_PAIRS]
                 + [(fg, bg, 0.0) for fg, bg in INFO_PAIRS])
        for fg, bg, minimum in rules:
            if fg not in theme_colours or bg not in theme_colours:
                continue
            if theme_colours[bg].alpha < 1:
                report.error(path, tokens.themes[theme][bg].line,
                             "%s --%s is a translucent surface; --%s on it has no defined contrast" % (theme, bg, fg))
                continue
            ratio = contrast_ratio(theme_colours[fg], theme_colours[bg])
            if minimum == 0.0:
                report.emit("INFO %s --%s on --%s: %.3f:1" % (theme, fg, bg, ratio))
            else:
                passed = ratio >= minimum
                verdict = "contrast ok" if passed else "contrast low"
                report.emit("%s %s --%s on --%s: %.3f:1 (min %.1f:1)" % (verdict, theme, fg, bg, ratio, minimum),
                            failing=not passed)


class CssValue(NamedTuple):
    prop: str
    value: str
    offset: int


def css_declarations(css: str, base_offset: int, in_block: bool = False) -> Iterator[CssValue]:
    """(property, value) of every declaration in CSS text, never a selector or at-rule prelude."""
    depth = 1 if in_block else 0
    start = 0
    for i, ch in enumerate(css + ";"):
        if ch == "{":
            depth += 1
            start = i + 1
        elif ch in ";}":
            segment = css[start:i]
            if depth > 0 and ":" in segment:
                prop, value = segment.split(":", 1)
                yield CssValue(prop.strip(), value, base_offset + start + len(prop) + 1)
            if ch == "}":
                depth = max(depth - 1, 0)
            start = i + 1


def _attr(m: "re.Match[str]") -> tuple[str, int]:
    """The value of a matched attribute: the first alternative (quoted or unquoted) that took part."""
    group = next((g for g in range(1, (m.lastindex or 1) + 1) if m.group(g) is not None), 1)
    return m.group(group) or "", m.start(group)


def css_contexts(text: str, suffix: str) -> list[CssValue]:
    """Declaration values in CSS contexts: a .css file, <style> blocks, style="" and colour attributes."""
    if suffix == ".css":
        return list(css_declarations(strip_comments(text, strict=False), 0))
    if suffix not in (".html", ".svg"):
        return []
    values: list[CssValue] = []
    for m in STYLE_BLOCK_RE.finditer(text):
        values.extend(css_declarations(strip_comments(m.group(2), strict=False), m.start(2)))
    for m in STYLE_ATTR_RE.finditer(text):
        value, offset = _attr(m)
        values.extend(css_declarations(value, offset, in_block=True))
    for m in COLOUR_ATTR_RE.finditer(text):
        value, offset = _attr(m)
        values.append(CssValue("", value, offset))
    return values


def _mask(text: str, start: int, end: int) -> str:
    return text[:start] + re.sub(r"[^\n]", " ", text[start:end]) + text[end:]


def check_urls(rel: str, text: str, report: Report) -> None:
    masked = text
    for tag in ANCHOR_TAG_RE.finditer(text):
        for m in HREF_RE.finditer(tag.group(0)):
            value, offset = _attr(m)
            masked = _mask(masked, tag.start() + offset, tag.start() + offset + len(value))
    for m in XMLNS_RE.finditer(text):
        value, offset = _attr(m)
        if value.startswith(XML_NAMESPACE_PREFIX):
            masked = _mask(masked, offset, offset + len(value))
    for m in ABSOLUTE_URL_RE.finditer(masked):
        tail = URL_TAIL_RE.match(text, m.end())
        url = text[m.start():tail.end() if tail else m.end()]
        report.error(rel, _line_of(text, m.start()),
                     "absolute URL %r: design files load nothing from the network" % url)
    for m in PROTOCOL_RELATIVE_RE.finditer(masked):
        report.error(rel, _line_of(text, m.start()), "protocol-relative URL: design files load nothing from the network")
    for m in SRCSET_RE.finditer(text):
        value, offset = _attr(m)
        for candidate in value.split(",")[1:]:
            if CANDIDATE_URL_RE.match(candidate.strip()):
                report.error(rel, _line_of(text, offset), "srcset candidate %r is a network URL" % candidate.strip())


class Scanned(NamedTuple):
    rel: str
    text: str
    values: list[CssValue]


def _scan_files(design_dir: str) -> list[Scanned]:
    files: list[Scanned] = []
    for root, dirs, names in os.walk(design_dir):
        dirs.sort()
        for name in sorted(names):
            if name.endswith(SCANNED_SUFFIXES):
                path = os.path.join(root, name)
                with open(path, encoding="utf-8") as fh:
                    text = fh.read()
                files.append(Scanned(path, text, css_contexts(text, os.path.splitext(name)[1])))
    return files


def check_prototypes(design_dir: str, tokens: Optional[Tokens], report: Report) -> list[Scanned]:
    files = _scan_files(design_dir)
    tokens_path = os.path.join(design_dir, TOKENS_REL)
    token_names = set(tokens.themes[ROOT]) | set(tokens.themes[DARK]) if tokens else set()
    global_names = set(token_names)
    for scanned in files:
        if scanned.rel.endswith(".css") and scanned.rel != tokens_path:
            global_names.update(value.prop[2:] for value in scanned.values if value.prop.startswith("--"))
    for scanned in files:
        check_urls(scanned.rel, scanned.text, report)
        if scanned.rel == tokens_path:
            continue
        for value in scanned.values:
            for m in RAW_COLOUR_RE.finditer(value.value):
                report.error(scanned.rel, _line_of(scanned.text, value.offset + m.start()),
                             "raw colour %r; use var(--token) from tokens.css" % m.group(0))
        if tokens is None:
            continue
        visible = global_names | {value.prop[2:] for value in scanned.values if value.prop.startswith("--")}
        for value in scanned.values:
            if value.prop.startswith("--"):
                _check_alias(scanned, value, token_names, tokens, report)
            for name in VAR_RE.findall(value.value):
                if name in visible:
                    continue
                line = _line_of(scanned.text, value.offset)
                if name in tokens.theme_inline:
                    report.error(scanned.rel, line, "--%s is defined only in @theme inline, which browsers ignore; "
                                 "declare it in proto.css :root with the same value" % name)
                else:
                    report.error(scanned.rel, line, "undefined variable --%s" % name)
    return files


def _check_alias(scanned: Scanned, value: CssValue, token_names: set[str], tokens: Tokens, report: Report) -> None:
    name, line = value.prop[2:], _line_of(scanned.text, value.offset)
    if name in token_names:
        report.error(scanned.rel, line, "prototype redeclares the tokens.css token --%s" % name)
    theme_decl = tokens.theme_inline.get(name)
    if theme_decl is not None and " ".join(value.value.split()) != theme_decl.value:
        report.error(scanned.rel, line,
                     "prototype alias --%s differs from @theme inline (%s)" % (name, theme_decl.value))


def check_flows(design_dir: str, files: Sequence[Scanned], report: Report) -> None:
    flows_dir = os.path.join(design_dir, FLOWS_DIR)
    if not os.path.isdir(flows_dir):
        return
    flow_files: dict[int, str] = {}
    steps: dict[tuple[int, int], str] = {}
    for name in sorted(os.listdir(flows_dir)):
        if not name.endswith(".md") or name == FLOW_REGISTRY:
            continue
        path = os.path.join(flows_dir, name)
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        local_flows: set[int] = set()
        for m in FLOW_HEADING_RE.finditer(text):
            flow = int(m.group(1))
            if flow in flow_files:
                report.error(path, _line_of(text, m.start()), "flow F%d is declared in %s and %s"
                             % (flow, flow_files[flow], path))
            flow_files.setdefault(flow, path)
            local_flows.add(flow)
        for m in FLOW_STEP_RE.finditer(text):
            step = (int(m.group(1)), int(m.group(2)))
            line = _line_of(text, m.start())
            if step in steps:
                report.error(path, line, "step F%d.%d is declared twice (also in %s)" % (step + (steps[step],)))
            steps.setdefault(step, path)
            if step[0] not in local_flows:
                report.error(path, line, "step F%d.%d has no flow heading F%d in this file" % (step + (step[0],)))
    for scanned in files:
        if scanned.rel.endswith(".html"):
            for m in DATA_STEP_RE.finditer(scanned.text):
                step = (int(m.group(1)), int(m.group(2)))
                if step not in steps:
                    report.error(scanned.rel, _line_of(scanned.text, m.start()),
                                 "data-step F%d.%d names no declared flow step" % step)


def check(design_dir: str) -> int:
    report = Report()
    tokens_path = os.path.join(design_dir, TOKENS_REL)
    tokens: Optional[Tokens] = None
    if os.path.isfile(tokens_path):
        try:
            tokens = parse_tokens(tokens_path, report)
        except TokensParseError as err:
            print("ERROR %s: cannot parse: %s" % (tokens_path, err))
            return 2
        check_pairs(tokens_path, tokens, check_tokens(tokens_path, tokens, report), report)
    else:
        report.error(tokens_path, 0, "missing; the design system's token file is required")
    files = check_prototypes(design_dir, tokens, report)
    check_flows(design_dir, files, report)
    print("\n".join(report.lines) if report.lines else "design check: clean")
    return 1 if report.failed else 0


def pair(fg_value: str, bg_value: str) -> int:
    try:
        ratio = contrast_ratio(parse_colour(fg_value), parse_colour(bg_value))
    except ColourError as err:
        print("ERROR %s" % err)
        return 2
    print("%s on %s: %.3f:1" % (fg_value, bg_value, ratio))
    return 0


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[1] == "check":
        return check(argv[2])
    if len(argv) == 4 and argv[1] == "pair":
        return pair(argv[2], argv[3])
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
