"""Tests for scripts/design_tokens.py. Every negative test differs from the valid minimal fixture in one
place, so the positive control proves that the fixture itself is clean."""
import os
import subprocess
import sys
import tempfile
import unittest
from typing import Optional

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
SCRIPTS = os.path.join(REPO, "scripts")
sys.path.insert(0, SCRIPTS)
import design_tokens  # noqa: E402

SCRIPT = os.path.join(SCRIPTS, "design_tokens.py")

LIGHT = {
    "background": "oklch(1 0 0)", "foreground": "oklch(0.145 0 0)",
    "card": "oklch(1 0 0)", "card-foreground": "oklch(0.145 0 0)",
    "popover": "oklch(1 0 0)", "popover-foreground": "oklch(0.145 0 0)",
    "primary": "oklch(0.205 0 0)", "primary-foreground": "oklch(0.985 0 0)",
    "secondary": "oklch(0.97 0 0)", "secondary-foreground": "oklch(0.205 0 0)",
    "muted": "oklch(0.97 0 0)", "muted-foreground": "oklch(0.5 0 0)",
    "accent": "oklch(0.97 0 0)", "accent-foreground": "oklch(0.205 0 0)",
    "destructive": "oklch(0.5 0.15 27)", "border": "oklch(0.922 0 0)",
    "input": "oklch(0.6 0 0)", "ring": "oklch(0.6 0 0)",
}
DARK = {
    "background": "oklch(0.145 0 0)", "foreground": "oklch(0.985 0 0)",
    "card": "oklch(0.205 0 0)", "card-foreground": "oklch(0.985 0 0)",
    "popover": "oklch(0.205 0 0)", "popover-foreground": "oklch(0.985 0 0)",
    "primary": "oklch(0.922 0 0)", "primary-foreground": "oklch(0.205 0 0)",
    "secondary": "oklch(0.269 0 0)", "secondary-foreground": "oklch(0.985 0 0)",
    "muted": "oklch(0.269 0 0)", "muted-foreground": "oklch(0.708 0 0)",
    "accent": "oklch(0.269 0 0)", "accent-foreground": "oklch(0.985 0 0)",
    "destructive": "oklch(0.704 0.15 22)", "border": "oklch(1 0 0 / 10%)",
    "input": "oklch(0.556 0 0)", "ring": "oklch(0.556 0 0)",
}
RADIUS_SM = "calc(var(--radius) - 4px)"
PROTO_CSS = """:root {
  --radius-sm: calc(var(--radius) - 4px);
  --font-sans: system-ui, sans-serif;
}
/* buttons */
.btn { color: var(--primary-foreground); background: var(--primary); border-radius: var(--radius-sm); }
#main { color: var(--foreground); }
"""
PROTO_JS = """// toggles the theme
document.documentElement.classList.toggle("dark", matchMedia("(prefers-color-scheme: dark)").matches);
"""
PAGE = """<!doctype html>
<html lang="ru">
<head><meta name="viewport" content="width=device-width"><title>Catalog</title>
<link rel="stylesheet" href="../../system/tokens.css"><link rel="stylesheet" href="../../system/proto.css"></head>
<body><main id="main">
<a href="https://docs.example/help" data-step="F1.1">Help</a>
<a href="#state-empty">Empty</a>
<button class="btn" data-step="F1.2">Start</button>
<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect fill="var(--primary)"/></svg>
</main><script src="../../system/proto.js"></script></body></html>
"""
JOURNEY = """# Learner journey

## F1: Start a lesson

1. F1.1 Learner opens the catalog
2. F1.2 Learner starts the lesson
3. F1.3 Learner sees the workspace
"""


def tokens_css(light: dict[str, str], dark: dict[str, str], theme: Optional[dict[str, str]] = None,
               extra: str = "") -> str:
    if theme is None:
        names = sorted(set(light) | set(dark))
        theme = {"color-" + n: "var(--%s)" % n for n in names if n != "radius"}
        theme["radius-sm"] = RADIUS_SM

    def block(decls: dict[str, str]) -> str:
        return "".join("  --%s: %s;\n" % kv for kv in decls.items())
    return ("@custom-variant dark (&:is(.dark *));\n\n:root {\n  --radius: 0.625rem;\n%s}\n\n.dark {\n%s}\n\n"
            "@theme inline {\n%s}\n%s" % (block(light), block(dark), block(theme), extra))


class DesignDir:
    """A valid minimal design directory; keyword arguments replace one part of it."""

    def __init__(self, tmp: str, light: Optional[dict[str, str]] = None, dark: Optional[dict[str, str]] = None,
                 tokens: Optional[str] = None, files: Optional[dict[str, Optional[str]]] = None) -> None:
        self.path = os.path.join(tmp, "design")
        content: dict[str, Optional[str]] = {
            "system/tokens.css": tokens if tokens is not None else tokens_css(light or LIGHT, dark or DARK),
            "system/proto.css": PROTO_CSS,
            "system/proto.js": PROTO_JS,
            "pages/catalog/prototype.html": PAGE,
            "flows/learner.md": JOURNEY,
            "flows/ia.md": "# IA\n\n| F1 | learner.md | Start a lesson |\n",
        }
        content.update(files or {})
        for rel, text in content.items():
            if text is None:
                continue
            full = os.path.join(self.path, rel)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "w", encoding="utf-8") as fh:
                fh.write(text)


def run_cli(*args: str) -> tuple[int, str]:
    done = subprocess.run([sys.executable, "-I", SCRIPT, *args], stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, universal_newlines=True, check=False)
    return done.returncode, done.stdout


def ratio(fg: str, bg: str) -> float:
    return design_tokens.contrast_ratio(design_tokens.parse_colour(fg), design_tokens.parse_colour(bg))


class CheckTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def check(self, light: Optional[dict[str, str]] = None, dark: Optional[dict[str, str]] = None,
              tokens: Optional[str] = None, files: Optional[dict[str, Optional[str]]] = None) -> tuple[int, str]:
        design = DesignDir(self.tmp, light, dark, tokens, files)
        return run_cli("check", design.path)

    def light_line(self, name: str) -> int:
        """The tokens.css line of a :root declaration: --radius is line 4, LIGHT follows in order."""
        return 5 + list(LIGHT).index(name)

    def errors(self, output: str) -> list[str]:
        return [line for line in output.splitlines() if line.startswith("ERROR")]

    def assert_one_error(self, output: str, *fragments: str) -> None:
        errors = self.errors(output)
        matching = [e for e in errors if all(f in e for f in fragments)]
        self.assertEqual(len(matching), 1, "want one ERROR with %r in:\n%s" % (fragments, output))


class ColourMathTest(unittest.TestCase):
    def test_achromatic_oklch_matches_hex_737373_contrast_on_white(self) -> None:
        value = ratio("oklch(0.556 0 0)", "oklch(1 0 0)")
        self.assertAlmostEqual(value, 4.742, delta=0.005)
        self.assertEqual(value, ratio("#737373", "#ffffff"))

    def test_white_on_black_is_21(self) -> None:
        self.assertAlmostEqual(ratio("#ffffff", "#000000"), 21.0, places=3)

    def test_percent_lightness_equals_number_lightness(self) -> None:
        self.assertEqual(design_tokens.parse_colour("oklch(55.6% 0 0)"), design_tokens.parse_colour("oklch(0.556 0 0)"))

    def test_short_hex_expands_to_long_hex(self) -> None:
        self.assertEqual(design_tokens.parse_colour("#0af"), design_tokens.parse_colour("#00aaff"))

    def test_srgb_primaries_round_trip_from_oklch(self) -> None:
        # Red and green: colorjs.io, new Color("red"|"lime").to("oklch"). Blue: the CSS Color 4 text
        # ("In OkLCh, sRGB blue is oklch(0.452 0.313 264.1)").
        oracles = {
            "oklch(0.6279553606145516 0.25768330773615683 29.2338851923426)": (255, 0, 0),
            "oklch(0.8664396115356694 0.2948272403578089 142.49533888780996)": (0, 255, 0),
            "oklch(0.452 0.313 264.1)": (0, 0, 255),
        }
        for value, want in oracles.items():
            got = design_tokens.srgb8(design_tokens.parse_colour(value))
            for g, w in zip(got, want):
                self.assertLessEqual(abs(g - w), 1, "%s -> %s, want %s" % (value, got, want))

    def test_translucent_border_composited_over_dark_background(self) -> None:
        # 10% white over oklch(0.145 0 0) blends to 34.5 of 255: 1.244 when the tie rounds down, 1.260 when
        # it rounds up. Ignoring alpha gives about 18.
        self.assertAlmostEqual(ratio("oklch(1 0 0 / 10%)", "oklch(0.145 0 0)"), 1.252, delta=0.02)


class TokenCheckTest(CheckTestCase):
    def test_valid_minimal_design_dir_exits_zero(self) -> None:
        rc, out = self.check()
        self.assertEqual(rc, 0, out)
        self.assertEqual(self.errors(out), [])
        self.assertNotIn("contrast low", out)

    def test_missing_tokens_file_exits_one(self) -> None:
        rc, out = self.check(files={"system/tokens.css": None})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "tokens.css", "missing")

    def test_muted_foreground_below_text_minimum_fails(self) -> None:
        rc, out = self.check(light=dict(LIGHT, **{"muted-foreground": "oklch(0.556 0 0)"}))
        self.assertEqual(rc, 1, out)
        self.assertIn("contrast low :root --muted-foreground on --muted: 4.349:1 (min 4.5:1)", out)

    def test_text_pair_just_above_minimum_passes(self) -> None:
        rc, out = self.check(light=dict(LIGHT, **{"muted-foreground": "oklch(0.545 0 0)"}))
        self.assertEqual(rc, 0, out)
        self.assertIn("contrast ok :root --muted-foreground on --muted: 4.542:1 (min 4.5:1)", out)

    def test_light_ring_default_fails_non_text_minimum(self) -> None:
        rc, out = self.check(light=dict(LIGHT, ring="oklch(0.708 0 0)"))
        self.assertEqual(rc, 1, out)
        self.assertIn("contrast low :root --ring on --background: 2.584:1 (min 3.0:1)", out)

    def test_ring_just_above_non_text_minimum_passes(self) -> None:
        rc, out = self.check(light=dict(LIGHT, ring="oklch(0.65 0 0)"))
        self.assertEqual(rc, 0, out)
        self.assertIn("contrast ok :root --ring on --background: 3.234:1 (min 3.0:1)", out)

    def test_out_of_gamut_token_is_an_error_naming_token_and_theme(self) -> None:
        rc, out = self.check(dark=dict(DARK, primary="oklch(0.7 0.4 150)"))
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, ".dark --primary", "out of sRGB gamut")

    def test_translucent_surface_is_an_error(self) -> None:
        rc, out = self.check(light=dict(LIGHT, muted="oklch(0.97 0 0 / 50%)"))
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "system/tokens.css:%d:" % self.light_line("muted"),
                              ":root --muted is a translucent surface", "--muted-foreground")

    def test_required_token_absent_from_both_themes_is_an_error(self) -> None:
        light = {k: v for k, v in LIGHT.items() if k != "ring"}
        dark = {k: v for k, v in DARK.items() if k != "ring"}
        rc, out = self.check(light=light, dark=dark)
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "required token --ring missing in :root and .dark")
        self.assertEqual(len(self.errors(out)), 1, out)

    def test_custom_color_token_missing_in_dark_is_an_error(self) -> None:
        # A custom token, mapped in @theme inline by the fixture builder: the required-token check cannot see it,
        # so only the theme-symmetry check reports it.
        rc, out = self.check(light=dict(LIGHT, brand="oklch(0.5 0.1 250)"))
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "colour token --brand has no colour value in .dark")
        self.assertEqual(len(self.errors(out)), 1, out)

    def test_theme_mapping_to_undefined_token_is_an_error(self) -> None:
        theme = {"color-" + n: "var(--%s)" % n for n in LIGHT}
        theme.update({"radius-sm": RADIUS_SM, "color-brand": "var(--brand)"})
        rc, out = self.check(tokens=tokens_css(LIGHT, DARK, theme))
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "--color-brand refers to --brand")

    def test_color_token_without_theme_mapping_is_an_error(self) -> None:
        theme = {"color-" + n: "var(--%s)" % n for n in LIGHT if n != "card"}
        theme["radius-sm"] = RADIUS_SM
        rc, out = self.check(tokens=tokens_css(LIGHT, DARK, theme))
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "--card needs --color-card: var(--card)")

    def test_non_colour_tokens_are_not_parsed_as_colours(self) -> None:
        rc, out = self.check(light=dict(LIGHT, spacing="0.25rem"), dark=dict(DARK, spacing="0.25rem"))
        self.assertEqual(rc, 0, out)

    def test_named_colour_or_rgb_value_in_tokens_is_an_error(self) -> None:
        rc, out = self.check(light=dict(LIGHT, brand="rebeccapurple", x="rgb(0 0 0)"))
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, ":root --brand", "neither a colour")
        self.assert_one_error(out, ":root --x", "neither a colour")

    def test_extra_top_level_rule_in_tokens_is_an_error(self) -> None:
        rc, out = self.check(tokens=tokens_css(LIGHT, DARK, extra="body { color: red; }\n"))
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "unexpected top-level item 'body'")

    def test_unbalanced_braces_in_tokens_exits_2(self) -> None:
        rc, out = self.check(tokens=tokens_css(LIGHT, DARK, extra=".x {\n"))
        self.assertEqual(rc, 2, out)
        self.assertIn("cannot parse", out)

    def test_unterminated_comment_in_tokens_exits_2(self) -> None:
        rc, out = self.check(tokens=tokens_css(LIGHT, DARK, extra="/* never closed\n"))
        self.assertEqual(rc, 2, out)
        self.assertIn("unterminated comment", out)


class PrototypeScanTest(CheckTestCase):
    def test_external_url_and_import_in_css_are_errors(self) -> None:
        css = PROTO_CSS + '@import "//cdn.example/x.css";\n.hero { background: url(https://x.example/a.png); }\n'
        rc, out = self.check(files={"system/proto.css": css})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "proto.css", "absolute URL")
        self.assert_one_error(out, "proto.css", "protocol-relative URL")

    def test_iframe_src_is_an_error(self) -> None:
        rc, out = self.check(files={"pages/catalog/prototype.html": PAGE.replace(
            "</main>", '<iframe src="https://x.example"></iframe></main>')})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "prototype.html", "absolute URL")

    def test_protocol_relative_srcset_is_an_error(self) -> None:
        first = PAGE.replace("</main>", '<img alt="" srcset="//cdn.example/a.png 2x"></main>')
        rc, out = self.check(files={"pages/catalog/prototype.html": first})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "prototype.html", "protocol-relative URL")
        second = PAGE.replace("</main>", '<img alt="" srcset="a.png 1x, //cdn.example/b.png 2x"></main>')
        rc, out = self.check(files={"pages/catalog/prototype.html": second})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "prototype.html", "srcset candidate '//cdn.example/b.png 2x'")

    def test_unquoted_srcset_later_candidate_is_an_error(self) -> None:
        page = PAGE.replace("</main>", '<img alt="" srcset=a.png,//cdn.example/e.png></main>')
        rc, out = self.check(files={"pages/catalog/prototype.html": page})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "prototype.html", "srcset candidate '//cdn.example/e.png'")

    def test_backslash_protocol_relative_src_is_an_error(self) -> None:
        page = PAGE.replace("</main>", '<img alt="" src="/\\cdn.example/f.png"></main>')
        rc, out = self.check(files={"pages/catalog/prototype.html": page})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "prototype.html", "protocol-relative URL")

    def test_fetch_and_websocket_urls_in_script_are_errors(self) -> None:
        page = PAGE.replace("</body>", '<script>new WebSocket("wss://x.example");</script></body>')
        rc, out = self.check(files={"system/proto.js": PROTO_JS + 'fetch("https://api.example/x");\n',
                                    "pages/catalog/prototype.html": page})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "proto.js", "absolute URL 'https://api.example/x':")
        self.assert_one_error(out, "prototype.html", "wss://x.example")

    def test_anchor_href_and_svg_xmlns_are_allowed(self) -> None:
        rc, out = self.check()
        self.assertEqual(rc, 0, out)
        self.assertIn('href="https://docs.example/help"', PAGE)
        self.assertIn('xmlns="http://www.w3.org/2000/svg"', PAGE)

    def test_anchor_ping_is_an_error(self) -> None:
        rc, out = self.check(files={"pages/catalog/prototype.html": PAGE.replace(
            "</main>", '<a href="x.html" ping="https://t.example">x</a></main>')})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "https://t.example")

    def test_js_line_comment_is_not_a_url(self) -> None:
        comments = "const a = 1; // toggles the theme\nconst b = 2; //toggles the theme\n"
        rc, out = self.check(files={"system/proto.js": comments + PROTO_JS})
        self.assertEqual(rc, 0, out)

    def test_raw_hex_in_proto_css_reported_with_line(self) -> None:
        rc, out = self.check(files={"system/proto.css": PROTO_CSS + ".bad {\n  color: #ff0000;\n}\n"})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "proto.css:9:", "raw colour '#ff0000'")

    def test_anchor_href_hash_is_not_a_color(self) -> None:
        rc, out = self.check(files={"pages/catalog/prototype.html": PAGE.replace(
            "</main>", '<a href="#bad">x</a></main>')})
        self.assertEqual(rc, 0, out)

    def test_id_selector_is_not_a_color(self) -> None:
        rc, out = self.check()
        self.assertEqual(rc, 0, out)
        self.assertIn("#main { color: var(--foreground); }", PROTO_CSS)
        rc, out = self.check(files={"system/proto.css": PROTO_CSS + ".x { color: #fff; }\n"})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "raw colour '#fff'")

    def test_undefined_var_reported_and_var_declared_in_proto_css_accepted(self) -> None:
        page = PAGE.replace('<main id="main">', '<main id="main" style="font-family: var(--font-sans); '
                                                 'color: var(--nope)">')
        rc, out = self.check(files={"pages/catalog/prototype.html": page})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "undefined variable --nope")
        self.assertEqual(len(self.errors(out)), 1, out)

    def test_style_attribute_variable_is_visible_only_on_its_page(self) -> None:
        own = PAGE.replace('<main id="main">', '<main id="main" style="--gap: 4px; padding: var(--gap)">')
        other = PAGE.replace('<main id="main">', '<main id="main" style="padding: var(--gap)">')
        rc, out = self.check(files={"pages/catalog/prototype.html": own, "pages/lesson/prototype.html": other})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "lesson/prototype.html", "undefined variable --gap")
        self.assertEqual(len(self.errors(out)), 1, out)

    def test_theme_inline_only_name_is_undefined_in_prototype(self) -> None:
        css = PROTO_CSS.replace("  --radius-sm: calc(var(--radius) - 4px);\n", "")
        rc, out = self.check(files={"system/proto.css": css + ".y { color: var(--color-primary); }\n"})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "--radius-sm is defined only in @theme inline")
        self.assert_one_error(out, "--color-primary is defined only in @theme inline")

    def test_proto_alias_must_equal_theme_value(self) -> None:
        css = PROTO_CSS.replace("- 4px", "- 2px")
        rc, out = self.check(files={"system/proto.css": css})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "prototype alias --radius-sm differs from @theme inline")
        rc, out = self.check()
        self.assertEqual(rc, 0, out)

    def test_prototype_redeclaring_a_token_is_an_error(self) -> None:
        css = PROTO_CSS.replace(":root {\n", ":root {\n  --primary: oklch(0.5 0 0);\n")
        rc, out = self.check(files={"system/proto.css": css})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "redeclares the tokens.css token --primary")


class FlowCheckTest(CheckTestCase):
    def test_flow_id_declared_in_two_journey_files_is_an_error(self) -> None:
        rc, out = self.check(files={"flows/second.md": "## F1: Again\n\n1. F1.9 Something\n"})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "flow F1 is declared in", "learner.md", "second.md")

    def test_duplicate_step_id_is_an_error(self) -> None:
        rc, out = self.check(files={"flows/learner.md": JOURNEY + "4. F1.2 Learner starts it again\n"})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "step F1.2 is declared twice")

    def test_step_without_flow_heading_is_an_error(self) -> None:
        rc, out = self.check(files={"flows/learner.md": JOURNEY + "\n- F2.1 Orphan step\n"})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "step F2.1 has no flow heading F2")

    def test_data_step_without_declared_step_is_an_error(self) -> None:
        rc, out = self.check(files={"pages/catalog/prototype.html": PAGE.replace(
            'data-step="F1.2"', 'data-step="F1.9"')})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "data-step F1.9 names no declared flow step")

    def test_flow_checks_run_without_tokens(self) -> None:
        rc, out = self.check(files={"system/tokens.css": None, "flows/second.md": "## F1: Again\n"})
        self.assertEqual(rc, 1, out)
        self.assert_one_error(out, "flow F1 is declared in")


VERDICT_WORDS = ("PASS", "FAIL", "VERDICT")


def starts_with_verdict(line: str) -> bool:
    """The judges' parser strips once, in a fixed order (whitespace, `#`, `*`, backtick); stripping until
    stable reaches the same first character or a later one, so every line the parser can take as a vote
    is caught here."""
    stripped = line
    while True:
        shorter = stripped.strip().strip("#*`")
        if shorter == stripped:
            break
        stripped = shorter
    return stripped.startswith(VERDICT_WORDS)


class ValidatorOutputVerdictTest(CheckTestCase):
    """Judges paste validator output into reports whose vote is the last line starting with a verdict."""

    def outputs(self) -> list[str]:
        failing = dict(LIGHT, **{"muted-foreground": "oklch(0.556 0 0)", "ring": "oklch(0.708 0 0)"})
        failing_page = PAGE.replace("</main>", '<img alt="" src="//cdn.example/x.png"></main>')
        _, passing = self.check()
        _, failed = self.check(light=failing, files={"pages/catalog/prototype.html": failing_page})
        _, paired = run_cli("pair", "oklch(0.556 0 0)", "#ffffff")
        _, usage = run_cli("nonsense")
        self.assertIn("contrast ok", passing)
        self.assertIn("contrast low", failed)
        return [passing, failed, paired, usage]

    def test_no_validator_output_line_starts_with_a_verdict(self) -> None:
        lines = [line for output in self.outputs() for line in output.splitlines()]
        self.assertEqual([line for line in lines if starts_with_verdict(line)], [])

    def test_verdict_prefix_detection(self) -> None:
        verdict_lines = ["PASS", "FAIL - 1 issues found", "VERDICT: PASS", "  PASS  ", "**PASS**", "## FAIL",
                         "`FAIL`", "# **`PASS`**", "* # PASS", "`` ** FAIL", "\u00a0PASS", "PASSED"]
        plain_lines = ["", "pass", "Passed", "contrast ok light foreground on background: 15.2:1 (min 4.5:1)",
                       "INFO 3 pages scanned", "ERROR system/tokens.css:9: PASS is not a colour",
                       "- PASS", "> FAIL", "1. FAIL"]
        self.assertEqual([line for line in verdict_lines if not starts_with_verdict(line)], [])
        self.assertEqual([line for line in plain_lines if starts_with_verdict(line)], [])


class PairCliTest(unittest.TestCase):
    def test_pair_cli_exit_codes(self) -> None:
        rc, out = run_cli("pair", "oklch(0.556 0 0)", "#ffffff")
        self.assertEqual(rc, 0, out)
        self.assertIn(": 4.742:1", out)
        rc, out = run_cli("pair", "notacolor", "#ffffff")
        self.assertEqual(rc, 2, out)


if __name__ == "__main__":
    unittest.main()
