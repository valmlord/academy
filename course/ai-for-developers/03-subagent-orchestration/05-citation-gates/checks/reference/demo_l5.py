"""Demo of citation-gate and gate-wired (design #43 revision 6, 5.L5 and 11): honest corpus first, then attacks.

Run with the pinned interpreter from a directory holding no `claude`:

    <python3.12> -I -B demo_l5.py --work <scratch dir> [--runs 20] [--wired-runs 20] [--jobs 8] [--only <text>]

Every line builds a workspace (the starter, or the starter with checks/reference/pipeline/ laid over it, plus
exactly one change), grades it with verify_citation_gate.py or, for gate-wired, through drive_l5.py (the check
with the demo hooks), and prints `ok` or `XX`.
- must-pass: every run exits 0;
- must-fail: every run exits 1, every run prints each required id, and no run prints an id outside the allowed set;
- recorded: the observed ids are printed, nothing is asserted.
For citation-gate the ids are G1-G4, `valid` (a valid finding rejected) and `api` (a crash or a wrong return type).
Static lines check the generator, the shared files and the starter before any graded run.
"""

from __future__ import annotations

import argparse
import inspect
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time
import types
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

REFERENCE = Path(__file__).resolve().parent
CHECKS = REFERENCE.parent
LESSON = CHECKS.parent
STARTER = LESSON / "starter"
MODULE = LESSON.parent
GATE = Path("pipeline/gate.py")
RUN = Path("pipeline/run.py")
ID_PATTERN = re.compile(r"^не выполнено: (G\d|W\d|[CFH]\d+)\b")

sys.dont_write_bytecode = True
sys.path.insert(0, str(CHECKS))

import gate_oracle as go  # noqa: E402
import verify_citation_gate as cg  # noqa: E402

Mutation = Callable[[Path], None]
# A stub only has to beat the run it is graded on, and retries are free: its pass rate is measured over 40 runs.
CHEAPEST_STUB_RUNS = 40


@dataclass
class Line:
    section: str
    name: str
    mutate: Mutation
    check: str  # gate | wired
    required: set[str] | None  # None: must pass
    allowed: set[str] = field(default_factory=set)
    kind: str = "fail"  # pass | fail | record
    base: str = "reference"
    driver_args: tuple[str, ...] = ()
    runs: int | None = None
    # Text no run may print (learner-chosen names and strings the grader must not echo).
    forbidden: tuple[str, ...] = ()
    results: list[dict[str, object]] = field(default_factory=list)


# ---------------------------------------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------------------------------------


def patched(text: str, pairs: tuple[tuple[str, str], ...], path: Path = GATE) -> str:
    for old, new in pairs:
        if text.count(old) != 1:
            raise AssertionError(f"demo patch anchor not unique in {path}: {old!r} ({text.count(old)})")
        text = text.replace(old, new)
    return text


def patch(*pairs: tuple[str, str], path: Path = GATE) -> Mutation:
    def apply(workspace: Path) -> None:
        target = workspace / path
        target.write_text(patched(target.read_text(encoding="utf-8"), pairs, path), encoding="utf-8")
    return apply


def write_file(path: str, text: str) -> Mutation:
    def apply(workspace: Path) -> None:
        (workspace / path).parent.mkdir(parents=True, exist_ok=True)
        (workspace / path).write_text(text, encoding="utf-8")
    return apply


def chain(*mutations: Mutation) -> Mutation:
    def apply(workspace: Path) -> None:
        for mutation in mutations:
            mutation(workspace)
    return apply


def nothing(_: Path) -> None:
    return None


# Anchors in checks/reference/pipeline/gate.py.
SPLIT = '''    pieces = text.split("\\n")
    if pieces[-1] == "":
        pieces.pop()
    return pieces'''
READ = 'text = path.read_text(encoding="utf-8")'
STRIP = "stripped = quote.strip()"
QUOTE_TEST = "if len(stripped) < MIN_QUOTE_CHARS or stripped not in lines[line - 1]:"
LINE_TEST = "if not isinstance(line, int) or isinstance(line, bool) or not 1 <= line <= len(lines):"
PARTS_TEST = 'if any(part in ("", ".", "..") for part in parts):'
IS_FILE = "if not path.is_file():"
FINDINGS_LOOP = '''    for finding in findings:
        rule = location_rule(finding, snapshot_root)
        if rule is not None:
            rejected[str(finding["id"])] = rule
    return rejected


def traces_to_sources'''
SYNTH_RULE = '''        rule = location_rule(finding, snapshot_root)
        if rule is None and not traces_to_sources(finding, accepted):
            rule = "G4"'''
SYNTH_TAIL = '''            rule = "G4"
        if rule is not None:
            rejected[str(finding["id"])] = rule
'''
TRACES = """def traces_to_sources(finding: dict[str, object], accepted: dict[str, dict[str, object]]) -> bool:
    source_ids = finding.get("source_ids")
    if not isinstance(source_ids, list) or not source_ids:
        return False
    if not all(isinstance(source_id, str) and source_id in accepted for source_id in source_ids):
        return False
    return any(accepted[source_id].get("file") == finding.get("file")
               and accepted[source_id].get("line") == finding.get("line") for source_id in source_ids)
"""
TRACES_CALL = "if rule is None and not traces_to_sources(finding, accepted):"


# ---------------------------------------------------------------------------------------------------------
# G4 variants (student final re-run: three wrong G4s in a row, each closed alone; now the whole list at once)
# ---------------------------------------------------------------------------------------------------------

# Each variant replaces traces_to_sources in the reference gate. They all get the snapshot root, so a variant may
# read the source's line. The prelude is the reference's own: a non-empty list of ids, every one accepted.
G4_PRELUDE = """    source_ids = finding.get("source_ids")
    if not isinstance(source_ids, list) or not source_ids:
        return False
    if not all(isinstance(source_id, str) and source_id in accepted for source_id in source_ids):
        return False
    sources = [accepted[source_id] for source_id in source_ids]
"""
G4_HELPERS = """def _source_line(source, snapshot_root):
    lines = snapshot_lines(source.get("file"), snapshot_root) or []
    line = source.get("line")
    return lines[line - 1] if isinstance(line, int) and 1 <= line <= len(lines) else ""


def _quote(finding):
    return str(finding.get("quote")).strip()


"""
SAME_FILE = 'source.get("file") == finding.get("file")'
SAME_LINE = 'source.get("line") == finding.get("line")'
QUOTE_EQUAL = "_quote(source) == _quote(finding)"
QUOTE_ON_SOURCE_LINE = "_quote(finding) in _source_line(source, snapshot_root)"


def any_source(condition: str) -> str:
    return f"{G4_PRELUDE}    return any({condition} for source in sources)\n"


@dataclass(frozen=True)
class G4Variant:
    name: str
    body: str  # the body of traces_to_sources(finding, accepted, snapshot_root)
    # wrong: some must-fail final finding passes it; strict: it rejects a must-pass one; same: equal to the oracle
    # on every input the task allows.
    verdict: str = "wrong"

    def source(self) -> str:
        return (G4_HELPERS + "def traces_to_sources(finding: dict[str, object], accepted: dict[str, dict[str, object]], "
                "snapshot_root: Path) -> bool:\n" + self.body)

    def pairs(self) -> tuple[tuple[str, str], ...]:
        return ((TRACES, self.source()), (TRACES_CALL, TRACES_CALL.replace(
            "traces_to_sources(finding, accepted)", "traces_to_sources(finding, accepted, snapshot_root)")))

    def mutation(self) -> Mutation:
        return patch(*self.pairs())

    def module(self) -> types.ModuleType:
        """The reference gate with this variant, loaded in the demo process for the static coverage lines."""
        module = types.ModuleType(f"gate_variant_{abs(hash(self.name))}")
        text = patched((REFERENCE / GATE).read_text(encoding="utf-8"), self.pairs())
        exec(compile(text, str(REFERENCE / GATE), "exec"), module.__dict__)  # noqa: S102 (the demo's own code)
        return module


G4_VARIANTS: tuple[G4Variant, ...] = (
    G4Variant("reference (file and line of a named source)", any_source(f"{SAME_FILE} and {SAME_LINE}"), "same"),
    G4Variant("path compared case-insensitively", any_source(
        'str(source.get("file")).lower() == str(finding.get("file")).lower() and ' + SAME_LINE), "same"),
    G4Variant("path compared after posixpath.normpath", any_source(
        '__import__("posixpath").normpath(str(source.get("file"))) == '
        '__import__("posixpath").normpath(str(finding.get("file"))) and ' + SAME_LINE), "same"),
    G4Variant("line compared as text", any_source(
        f'{SAME_FILE} and str(source.get("line")) == str(finding.get("line"))'), "same"),
    G4Variant("file only", any_source(SAME_FILE)),
    G4Variant("line only (n1)", any_source(SAME_LINE)),
    G4Variant("quote equal to a named source's quote, place ignored", any_source(QUOTE_EQUAL)),
    G4Variant("quote stands on a named source's line, place ignored", any_source(QUOTE_ON_SOURCE_LINE)),
    G4Variant("file and quote equal", any_source(f"{SAME_FILE} and {QUOTE_EQUAL}")),
    G4Variant("file, quote on the source's line", any_source(f"{SAME_FILE} and {QUOTE_ON_SOURCE_LINE}")),
    G4Variant("line and quote equal", any_source(f"{SAME_LINE} and {QUOTE_EQUAL}")),
    G4Variant("line, quote on the source's line", any_source(f"{SAME_LINE} and {QUOTE_ON_SOURCE_LINE}")),
    G4Variant("no place test", f"{G4_PRELUDE}    return True\n"),
    G4Variant("place matched against any accepted finding", G4_PRELUDE + (
        '    return any(other.get("file") == finding.get("file") and other.get("line") == finding.get("line")\n'
        '               for other in accepted.values())\n')),
    G4Variant("place matched against the accepted findings in the named sources' files", G4_PRELUDE + (
        '    files = {source.get("file") for source in sources}\n'
        '    return any(other.get("file") == finding.get("file") and other.get("line") == finding.get("line")\n'
        '               for other in accepted.values() if other.get("file") in files)\n')),
    G4Variant("unknown ids skipped, one known matching source enough (n2)", (
        '    source_ids = finding.get("source_ids")\n'
        '    if not isinstance(source_ids, list) or not source_ids:\n'
        '        return False\n'
        '    sources = [accepted[s] for s in source_ids if isinstance(s, str) and s in accepted]\n'
        f'    return any({SAME_FILE} and {SAME_LINE} for source in sources)\n')),
    G4Variant("unknown ids counted as matching", (
        '    source_ids = finding.get("source_ids")\n'
        '    if not isinstance(source_ids, list) or not source_ids:\n'
        '        return False\n'
        '    return any(not isinstance(s, str) or s not in accepted or (\n'
        '        accepted[s].get("file") == finding.get("file") and accepted[s].get("line") == finding.get("line"))\n'
        '        for s in source_ids)\n')),
    G4Variant("empty source_ids taken as nothing to check", (
        '    source_ids = finding.get("source_ids")\n'
        '    if not isinstance(source_ids, list):\n'
        '        return False\n'
        '    if not source_ids:\n'
        '        return True\n' + G4_PRELUDE.split("        return False\n", 1)[1]
        + f'    return any({SAME_FILE} and {SAME_LINE} for source in sources)\n')),
    G4Variant("a str source_ids taken as one id", (
        '    source_ids = finding.get("source_ids")\n'
        '    if isinstance(source_ids, str):\n'
        '        source_ids = [source_ids]\n'
        + G4_PRELUDE.split('    source_ids = finding.get("source_ids")\n', 1)[1]
        + f'    return any({SAME_FILE} and {SAME_LINE} for source in sources)\n')),
    G4Variant("only the first id checked", (
        '    source_ids = finding.get("source_ids")\n'
        '    if not isinstance(source_ids, list) or not source_ids or source_ids[0] not in accepted:\n'
        '        return False\n'
        '    source = accepted[source_ids[0]]\n'
        f'    return {SAME_FILE} and {SAME_LINE}\n')),
    G4Variant("only the last id checked", (
        '    source_ids = finding.get("source_ids")\n'
        '    if not isinstance(source_ids, list) or not source_ids or source_ids[-1] not in accepted:\n'
        '        return False\n'
        '    source = accepted[source_ids[-1]]\n'
        f'    return {SAME_FILE} and {SAME_LINE}\n')),
    # Student final re-run 2: file and line from different sources, a loosened equality, a test skipped in some
    # cases. v1-v4 are the student's; the three after each are one more of the same family.
    G4Variant("v1: file in the named files and line in the named lines, from different sources", G4_PRELUDE + (
        '    files = {source.get("file") for source in sources}\n'
        '    lines = {source.get("line") for source in sources}\n'
        '    return finding.get("file") in files and finding.get("line") in lines\n')),
    G4Variant("v2: same file, line within +-1", any_source(
        f'{SAME_FILE} and abs(int(str(source.get("line"))) - int(str(finding.get("line")))) <= 1')),
    G4Variant("v3: basename of the file and the line", any_source(
        'str(source.get("file")).rsplit("/", 1)[-1] == str(finding.get("file")).rsplit("/", 1)[-1] and '
        + SAME_LINE)),
    G4Variant("v4: place test skipped when two or more ids are named", G4_PRELUDE + (
        '    if len(sources) > 1:\n'
        '        return True\n'
        f'    return any({SAME_FILE} and {SAME_LINE} for source in sources)\n')),
    G4Variant("v5: file and line from named sources separately, quote equal to a named source's", G4_PRELUDE + (
        '    return (any(source.get("file") == finding.get("file") for source in sources)\n'
        '            and any(source.get("line") == finding.get("line") for source in sources)\n'
        f'            and any({QUOTE_EQUAL} for source in sources))\n')),
    G4Variant("v6: same file, line within +-2", any_source(
        f'{SAME_FILE} and abs(int(str(source.get("line"))) - int(str(finding.get("line")))) <= 2')),
    G4Variant("v7: place test skipped when the named sources lie in two or more files", G4_PRELUDE + (
        '    if len({source.get("file") for source in sources}) > 1:\n'
        '        return True\n'
        f'    return any({SAME_FILE} and {SAME_LINE} for source in sources)\n')),
    # Student final re-run 3: c2 matches paths by a whole-component suffix (both ways, then each way alone); c5
    # maps each place to one accepted id, keeping the last or the first one at a shared place.
    G4Variant("c2: path suffix by whole components either way, line equal", any_source(
        '(str(finding.get("file")) == str(source.get("file")) or str(finding.get("file")).endswith("/" + '
        'str(source.get("file"))) or str(source.get("file")).endswith("/" + str(finding.get("file")))) and '
        + SAME_LINE)),
    G4Variant("c2a: the finding's path ends with / + the source's path, line equal", any_source(
        '(str(finding.get("file")) == str(source.get("file")) or str(finding.get("file")).endswith("/" + '
        'str(source.get("file")))) and ' + SAME_LINE)),
    G4Variant("c2b: the source's path ends with / + the finding's path, line equal", any_source(
        '(str(finding.get("file")) == str(source.get("file")) or str(source.get("file")).endswith("/" + '
        'str(finding.get("file")))) and ' + SAME_LINE)),
    G4Variant("c5: place -> id map over every accepted finding, the last id kept", G4_PRELUDE + (
        '    places = {(a.get("file"), a.get("line")): sid for sid, a in accepted.items()}\n'
        '    return places.get((finding.get("file"), finding.get("line"))) in source_ids\n'), "strict"),
    G4Variant("c5f: place -> id map over every accepted finding, the first id kept", G4_PRELUDE + (
        '    places = {}\n'
        '    for sid, a in accepted.items():\n'
        '        places.setdefault((a.get("file"), a.get("line")), sid)\n'
        '    return places.get((finding.get("file"), finding.get("line"))) in source_ids\n'), "strict"),
    G4Variant("every named source must hold the place", G4_PRELUDE + (
        f'    return all({SAME_FILE} and {SAME_LINE} for source in sources)\n'), "strict"),
    G4Variant("the quote compared too", any_source(f"{SAME_FILE} and {SAME_LINE} and {QUOTE_EQUAL}"), "strict"),
)
# The wrong G4s a gate.py can hold in gate-wired: there the role's schema keeps source_ids a list of strings.
WIRED_EXEMPT = ("a str source_ids taken as one id",)
# The strict G4s gate-wired must catch too: every run with good final findings plants a shared place.
WIRED_STRICT = ("c5: place -> id map over every accepted finding, the last id kept",
                "c5f: place -> id map over every accepted finding, the first id kept")

# Anchors in checks/reference/pipeline/run.py.
GATE1 = '''        rejected = check_findings(findings, PROJECT)
        log_rejections(run_dir, rejected, "synthesizer")
        accepted = passed(findings, rejected)'''
SYN_CALL = 'synthesis = call("synthesizer", synthesizer_prompt(accepted), run_dir, log)'
GATE2 = '''        rejected = check_synthesis(raw_synthesized, {str(f["id"]): f for f in accepted}, PROJECT)
        log_rejections(run_dir, rejected, "summarizer")
        synthesized = passed(raw_synthesized, rejected)'''
SUM_CALL = 'summary = call("summarizer", summarizer_prompt(synthesized), run_dir, log)'
# A wrong G4 that lives in run.py: the second joint gets the reviewers' raw findings as `accepted`.
G4_RAW_FINDINGS = patch(('check_synthesis(raw_synthesized, {str(f["id"]): f for f in accepted}, PROJECT)',
                         'check_synthesis(raw_synthesized, {str(f["id"]): f for f in findings}, PROJECT)'), path=RUN)
LOG_WRITE = '            handle.write(json.dumps({"id": finding_id, "joint": joint, "rule": rule}) + "\\n")'
TOUCH = "        (run_dir / GATE_LOG).touch()\n"
REPORT_ANCHOR = '"total_cost_usd": log.total_cost_usd(), "status": report_status(unreviewed, synthesized),'


# ---------------------------------------------------------------------------------------------------------
# citation-gate corpus
# ---------------------------------------------------------------------------------------------------------


def gate_honest() -> list[Line]:
    lines = [
        ("reference gate", nothing),
        ("splitlines()", patch((SPLIT, "    return text.splitlines()"))),
        ("split('\\n') keeping the final empty piece", patch((SPLIT, '    return text.split("\\n")'))),
        ("readlines() + rstrip('\\n')", patch((READ, "text = ''.join(path.open(encoding='utf-8').readlines())"),
                                             (SPLIT, '    return [l.rstrip("\\n") for l in text.splitlines(True)]'))),
        ("manual line counting, character by character", patch((SPLIT, '''    pieces, current = [], []
    for character in text:
        if character == "\\n":
            pieces.append("".join(current))
            current = []
        else:
            current.append(character)
    if current:
        pieces.append("".join(current))
    return pieces'''))),
        ("open() with the default encoding", patch((READ, "text = open(path).read()"))),
        ("Path.read_text() without an encoding", patch((READ, "text = path.read_text()"))),
        ("read_bytes().decode('ascii')", patch((READ, "text = path.read_bytes().decode('ascii')"))),
        ("open(encoding='latin-1')", patch((READ, "text = open(path, encoding='latin-1').read()"))),
        ("strip(' \\t') (the only whitespace a snapshot line holds)", patch((STRIP, 'stripped = quote.strip(" \\t")'))),
        ("re.search with re.escape", patch((QUOTE_TEST, "if len(stripped) < MIN_QUOTE_CHARS or not "
                                                        "__import__('re').search(__import__('re').escape(stripped), "
                                                        "lines[line - 1]):"))),
        ("os.path.isfile after the textual checks", patch((IS_FILE, "if not __import__('os').path.isfile(path):"))),
        ("every G1-G3 failure reported as G3 (a broken rule, not the first)",
         patch(('            rejected[str(finding["id"])] = rule\n    return rejected\n\n\ndef traces_to_sources',
                '            rejected[str(finding["id"])] = "G3"\n    return rejected\n\n\ndef traces_to_sources'))),
        ("every synthesized rejection reported as G4",
         patch((SYNTH_TAIL, SYNTH_TAIL.replace('] = rule', '] = "G4"')))),
        ("G4 tested before G1-G3 in check_synthesis",
         patch((SYNTH_RULE, '''        rule = "G4" if not traces_to_sources(finding, accepted) else location_rule(finding, snapshot_root)'''))),
        ("files cached per call", patch(("def snapshot_lines(file: object, snapshot_root: Path) -> list[str] | None:",
                                         "import functools\n\n\n@functools.lru_cache(maxsize=None)\n"
                                         "def snapshot_lines(file: object, snapshot_root: Path) -> list[str] | None:"),
                                        ("    lines = snapshot_lines(finding.get(\"file\"), snapshot_root)",
                                         "    file = finding.get(\"file\")\n    lines = snapshot_lines(file if "
                                         "isinstance(file, str) else None, snapshot_root)"))),
        ("a learner test file that monkeypatches the gate (tests are not imported)",
         write_file("tests/test_gate.py", "import pipeline.gate as gate\n\ngate.check_findings = lambda f, r: {}\n")),
        ("a gate module importing a sibling helper", chain(
            write_file("pipeline/gate_lines.py", "def lines_of(text):\n    return text.splitlines()\n"),
            patch((SPLIT, "    from gate_lines import lines_of\n    return lines_of(text)")))),
    ]
    lines += [(f"G4 variant: {variant.name}", variant.mutation()) for variant in G4_VARIANTS
              if variant.verdict == "same"]
    return [Line("honest citation-gate", name, mutate, "gate", None, kind="pass") for name, mutate in lines]


def gate_attacks() -> list[Line]:
    every = {"G1", "G2", "G3", "G4", "valid", "api"}
    accept_all = '''def check_findings(findings, snapshot_root):
    return {}


def check_synthesis(findings, accepted, snapshot_root):
    return {}
'''
    reject_all = '''def check_findings(findings, snapshot_root):
    return {str(f["id"]): "G3" for f in findings}


def check_synthesis(findings, accepted, snapshot_root):
    return {str(f["id"]): "G4" for f in findings}
'''
    format_only = '''import re

PATH = re.compile(r"^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$")


def _rule(f):
    if not isinstance(f.get("file"), str) or not PATH.match(f["file"]) or "/./" in f["file"] or ".." in f["file"]:
        return "G1"
    if type(f.get("line")) is not int or f["line"] < 1:
        return "G2"
    if not isinstance(f.get("quote"), str) or len(f["quote"].strip()) < 12:
        return "G3"
    return None


def check_findings(findings, snapshot_root):
    return {str(f["id"]): r for f in findings if (r := _rule(f))}


def check_synthesis(findings, accepted, snapshot_root):
    out = {}
    for f in findings:
        r = _rule(f) or (None if isinstance(f.get("source_ids"), list) and f["source_ids"] else "G4")
        if r:
            out[str(f["id"])] = r
    return out
'''
    file_exists_only = '''from pathlib import Path


def _ok(f, root):
    return isinstance(f.get("file"), str) and (Path(root) / f["file"]).is_file()


def check_findings(findings, snapshot_root):
    return {str(f["id"]): "G1" for f in findings if not _ok(f, snapshot_root)}


def check_synthesis(findings, accepted, snapshot_root):
    return {str(f["id"]): "G1" for f in findings if not _ok(f, snapshot_root)}
'''
    attacks: list[tuple[str, Mutation, set[str]]] = [
        ("accept-all", write_file(str(GATE), accept_all), {"G1", "G2", "G3", "G4"}),
        ("reject-all (a broken rule for each)", write_file(str(GATE), reject_all), {"valid"}),
        ("format-only regex, no file read", write_file(str(GATE), format_only), set()),
        ("file-exists only", write_file(str(GATE), file_exists_only), set()),
        ("first finding only", patch((FINDINGS_LOOP, FINDINGS_LOOP.replace("for finding in findings:",
                                                                           "for finding in findings[:1]:"))), set()),
        ("unescaped regex (re.search on the quote)",
         patch((QUOTE_TEST, "if len(stripped) < MIN_QUOTE_CHARS or not __import__('re').search(stripped, "
                            "lines[line - 1]):")), set()),
        ("PurePosixPath normalising the path (RS14, course rule)",
         patch(('    parts = file.split("/")', '    parts = [p for p in __import__("pathlib").PurePosixPath(file).parts '
                                               'if p != "/"]'),
               (PARTS_TEST, 'if any(part in ("", "..") for part in parts):')), {"G1"}),
        ("snapshot_root ignored: devtools/snapshot hard-coded",
         patch(("    path = snapshot_root.joinpath(*parts)",
                "    path = (Path(__file__).resolve().parent.parent / 'devtools' / 'snapshot').joinpath(*parts)")),
         {"valid"}),
        ("bool accepted as a line", patch((LINE_TEST, "if not isinstance(line, int) or not 1 <= line <= len(lines):")),
         {"G2"}),
        ("line coerced with int() ('3', 3.0 accepted)",
         patch((LINE_TEST, "if not isinstance(line, (int, str, float)) or isinstance(line, bool) or not "
                           "1 <= int(line) <= len(lines):"), (QUOTE_TEST, QUOTE_TEST.replace("lines[line - 1]",
                                                                                              "lines[int(line) - 1]"))),
         {"G2"}),
        ("off-by-one line index (lines[line])",
         patch((QUOTE_TEST, "if len(stripped) < MIN_QUOTE_CHARS or line >= len(lines) or stripped not in lines[line]:")),
         set()),
        ("quote searched in the whole file", patch((QUOTE_TEST, "if len(stripped) < MIN_QUOTE_CHARS or stripped not in "
                                                                "'\\n'.join(lines):")), {"G3"}),
        ("case-insensitive quote", patch((QUOTE_TEST, "if len(stripped) < MIN_QUOTE_CHARS or stripped.lower() not in "
                                                      "lines[line - 1].lower():")), {"G3"}),
        ("no length check on the quote", patch((QUOTE_TEST, "if stripped not in lines[line - 1]:")), {"G3"}),
        ("G3 read as `quote in line` (the raw quote on the line)",
         patch((QUOTE_TEST, "if len(stripped) < MIN_QUOTE_CHARS or quote not in lines[line - 1]:")), {"valid"}),
        ("G3 length measured on the raw quote",
         patch((QUOTE_TEST, "if len(quote) < MIN_QUOTE_CHARS or stripped not in lines[line - 1]:")), {"G3"}),
        ("strip(' ') only (edge tabs kept)", patch((STRIP, 'stripped = quote.strip(" ")')), {"valid"}),
        ("every rejection reported as G1 (rule hard-coded)",
         patch(('            rejected[str(finding["id"])] = rule\n    return rejected\n\n\ndef traces_to_sources',
                '            rejected[str(finding["id"])] = "G1"\n    return rejected\n\n\ndef traces_to_sources')),
         {"G2", "G3"}),
        ("check_findings reports G4", patch(('            rejected[str(finding["id"])] = rule\n    return rejected\n\n\n'
                                             'def traces_to_sources', '            rejected[str(finding["id"])] = "G4"\n'
                                             '    return rejected\n\n\ndef traces_to_sources')), {"G1", "G2", "G3"}),
        ("synthesis without G1-G3", patch((SYNTH_RULE, '''        rule = None if traces_to_sources(finding, accepted) else "G4"''')),
         {"G3"}),
        ("the untouched skeleton raises NotImplementedError", nothing, {"api"}),
    ]
    attacks += [(f"G4 variant: {variant.name}", variant.mutation(), {"G4"} if variant.verdict == "wrong" else {"valid"})
                for variant in G4_VARIANTS if variant.verdict != "same"]
    out = []
    for name, mutate, required in attacks:
        base = "starter" if name.startswith("the untouched skeleton") else "reference"
        out.append(Line("attack citation-gate", name, mutate, "gate", required, every, base=base))
    # Student fix round, c17: learner text the child reports must not reach the message.
    secret = "zqxleak"
    echoes: list[tuple[str, Mutation, set[str]]] = [
        ("an exception class named by the solution", patch((FINDINGS_LOOP, FINDINGS_LOOP.replace(
            "    for finding in findings:\n",
            f"    raise type('{secret}_checks_reference', (Exception,), {{}})()\n    for finding in findings:\n"))),
         {"api"}),
        ("an exception class that shadows a builtin name in a solution module",
         patch((FINDINGS_LOOP, FINDINGS_LOOP.replace("    for finding in findings:\n",
                                                     "    raise type('KeyError', (Exception,), {})()\n"
                                                     "    for finding in findings:\n"))), {"api"}),
        ("a rule value carrying text", patch(('            rejected[str(finding["id"])] = rule\n    return rejected\n\n\n'
                                              'def traces_to_sources',
                                              f'            rejected[str(finding["id"])] = rule + " {secret}"\n'
                                              '    return rejected\n\n\ndef traces_to_sources')), set()),
        ("a key that is not an id, carrying text", patch(('            rejected[str(finding["id"])] = rule\n'
                                                          '    return rejected\n\n\ndef traces_to_sources',
                                                          '            rejected[str(finding["id"])] = rule\n'
                                                          f'    rejected["{secret}"] = "G1"\n    return rejected\n\n\n'
                                                          'def traces_to_sources')), {"api"}),
        ("an import error carrying text", patch(("MIN_QUOTE_CHARS = 12", f"MIN_QUOTE_CHARS = 12\n"
                                                 f"raise ImportError('{secret} listing')")), {"api"}),
        ("a return value of a class named by the solution",
         patch(('    """Check reviewer findings against G1-G3."""',
                '    """Check reviewer findings against G1-G3."""\n'
                f"    return type('{secret}', (object,), {{}})()")), {"api"}),
    ]
    for name, mutate, required in echoes:
        out.append(Line("attack citation-gate", f"no echo: {name}", mutate, "gate", required, every,
                        forbidden=(secret,)))
    out.append(Line("attack citation-gate", "a must-fail gate plus a test file that monkeypatches it to look right",
                    chain(write_file(str(GATE), accept_all),
                          write_file("tests/test_gate.py", "import pipeline.gate as gate\n\n"
                                     "gate.check_findings = lambda f, r: {str(x['id']): 'G1' for x in f}\n")),
                    "gate", {"G1", "G2", "G3", "G4"}, every))
    return out


# ---------------------------------------------------------------------------------------------------------
# gate-wired corpus
# ---------------------------------------------------------------------------------------------------------

ACCEPTED_BY_PATH = patch(
    (SYN_CALL, '''(run_dir / "accepted.json").write_text(json.dumps(accepted, ensure_ascii=False, indent=2),
                                                 encoding="utf-8")
        synthesis = call("synthesizer", f"Находки разделов ревью лежат в файле {run_dir / 'accepted.json'}. "
                         "Сведи их в итоговые находки по контракту.", run_dir, log)'''), path=RUN)
SYNTHESIZED_BY_PATH = patch(
    (SUM_CALL, '''(run_dir / "synthesized.json").write_text(json.dumps(synthesized, ensure_ascii=False, indent=2),
                                                    encoding="utf-8")
        summary = call("summarizer", f"Итоговые находки лежат в файле {run_dir / 'synthesized.json'}. "
                       "Напиши тимлиду итог.", run_dir, log)'''), path=RUN)
LOG_AT_END = patch(
    (TOUCH, ""),
    ('''def log_rejections(run_dir: Path, rejected: dict[str, str], joint: str) -> None:''',
     '''PENDING: list[dict[str, str]] = []


def log_rejections(run_dir: Path, rejected: dict[str, str], joint: str) -> None:
    PENDING.extend({"id": i, "joint": joint, "rule": r} for i, r in rejected.items())


def write_gate_log(run_dir: Path) -> None:'''),
    ('''    with (run_dir / GATE_LOG).open("a", encoding="utf-8") as handle:
        for finding_id, rule in rejected.items():
            handle.write(json.dumps({"id": finding_id, "joint": joint, "rule": rule}) + "\\n")''',
     '''    (run_dir / GATE_LOG).write_text("".join(json.dumps(e) + "\\n" for e in PENDING), encoding="utf-8")'''),
    ('''    report = {"summary"''', '''    write_gate_log(run_dir)
    report = {"summary"'''), path=RUN)
APPLY_GATE_HELPER = patch(
    ('''def passed(findings''', '''def apply_gate(run_dir: Path, findings: list[dict[str, object]], rejected: dict[str, str],
               joint: str) -> list[dict[str, object]]:
    log_rejections(run_dir, rejected, joint)
    return [f for f in findings if str(f["id"]) not in rejected]


def passed(findings'''),
    (GATE1, '''        accepted = apply_gate(run_dir, findings, check_findings(findings, PROJECT), "synthesizer")'''),
    (GATE2, '''        synthesized = apply_gate(run_dir, raw_synthesized, check_synthesis(
            raw_synthesized, {str(f["id"]): f for f in accepted}, PROJECT), "summarizer")'''), path=RUN)


# Student fix round: run.py "repairs" a class of bad finding before the first gate instead of rejecting it.
def repair_before_gate(body: str) -> Mutation:
    return patch((GATE1, "        for finding in findings:\n" + body + GATE1), path=RUN)


NORMALISE_PATHS = repair_before_gate('''            if isinstance(finding.get("file"), str):
                finding["file"] = __import__("posixpath").normpath(finding["file"])
''')
NORMALISE_DOT_SLASH = repair_before_gate('''            if isinstance(finding.get("file"), str) and finding["file"].startswith("./"):
                finding["file"] = finding["file"][2:]
''')
COERCE_FLOAT_LINE = repair_before_gate('''            if isinstance(finding.get("line"), float) and finding["line"].is_integer():
                finding["line"] = int(finding["line"])
''')
QUOTED_LINE = '''            try:
                text = (PROJECT / str(finding["file"])).read_text(encoding="utf-8").split("\\n")[int(finding["line"]) - 1]
            except (OSError, ValueError, IndexError, TypeError):
                continue
'''
REPAIR_QUOTES = repair_before_gate(QUOTED_LINE + '''            if str(finding["quote"]).strip() not in text:
                finding["quote"] = text.strip()
''')
REPAIR_CASE_ONLY = repair_before_gate(QUOTED_LINE + '''            quote = str(finding["quote"]).strip()
            if quote not in text and quote.lower() in text.lower():
                finding["quote"] = text.strip()
''')
LEAK_UPPER = patch((SYN_CALL, 'synthesis = call("synthesizer", synthesizer_prompt(accepted) + "\\n" + '
                              'json.dumps(findings).upper(), run_dir, log)'), path=RUN)
LEAK_ESCAPED = patch((SYN_CALL, 'synthesis = call("synthesizer", synthesizer_prompt(accepted) + "\\n" + "".join('
                                '"\\\\u%04x" % ord(c) for c in json.dumps(findings)), run_dir, log)'), path=RUN)
LEAK_UTF16 = patch((SYN_CALL, '''(run_dir / "all.txt").write_bytes(json.dumps(findings).encode("utf-16"))
        synthesis = call("synthesizer", synthesizer_prompt(accepted) + f"\\nВсе находки: {run_dir / 'all.txt'}",
                         run_dir, log)'''), path=RUN)
LEAK_PROJECT_STASH = patch((SYN_CALL, '''stash = PROJECT / "work" / "all-findings.json"
        stash.parent.mkdir(exist_ok=True)
        stash.write_text(json.dumps(findings), encoding="utf-8")
        synthesis = call("synthesizer", synthesizer_prompt(accepted) + f"\\nВсе находки: {stash}", run_dir, log)
        stash.unlink()'''), path=RUN)
# L3 N3, same class here: the coder's own diff file carries the rejected findings while the synthesizer runs.
LEAK_DIFF_FILE_STASH = patch((SYN_CALL, '''diff_file = PROJECT / str(change["diff_path"])
        original = diff_file.read_bytes()
        diff_file.write_bytes(original + ("\\n# all findings: " + json.dumps(findings)).encode("utf-8"))
        try:
            synthesis = call("synthesizer", synthesizer_prompt(accepted), run_dir, log)
        finally:
            diff_file.write_bytes(original)'''), path=RUN)
# Re-run fix round, both reads: the same stash with the diff file named in the synthesizer prompt. The run-end
# read sees the restored file, so only the request-time read holds the findings.
LEAK_DIFF_FILE_NAMED = patch((SYN_CALL, '''diff_file = PROJECT / str(change["diff_path"])
        original = diff_file.read_bytes()
        diff_file.write_bytes(original + ("\\n# all findings: " + json.dumps(findings)).encode("utf-8"))
        try:
            synthesis = call("synthesizer", synthesizer_prompt(accepted) + f"\\nИзменение: {diff_file}", run_dir,
                             log)
        finally:
            diff_file.write_bytes(original)'''), path=RUN)
# Hold-and-poll round (student re-run 2, b1): a stash written only once the call has run a while, and removed
# when the call returns. Under a fake that answers at once it is never written. The delay counts from before
# `claude` starts, so under load a 50-150 ms write (b1 as the student wrote it) may land before the request
# reaches the grader and be seen on arrival; the 0.3-2.5 s lines land only inside the hold.
B1_DELAY = "0.05 + __import__('random').random() * 0.1"
HOLD_ONLY_DELAY = "0.3 + __import__('random').random() * 2.2"


def delayed(role_call: str, prepare: str, write: str, undo: str, prompt_suffix: str = "",
            delay: str = HOLD_ONLY_DELAY) -> Mutation:
    """The `role_call` statement of run.py wrapped: `prepare` runs first, `write` runs in a thread once the call
    has run `delay` seconds and is still running, `undo` runs after the call returns."""
    call = role_call.replace("), run_dir, log)", f"){prompt_suffix}, run_dir, log)")
    if call == role_call and prompt_suffix:
        raise AssertionError(f"demo: no prompt to extend in {role_call!r}")
    return patch((role_call, f'''{prepare}
        returned = threading.Event()

        def late_write() -> None:
            if not returned.wait({delay}):
                {write}

        writer = threading.Thread(target=late_write)
        writer.start()
        try:
            {call}
        finally:
            returned.set()
            writer.join()
            {undo}'''), path=RUN)


B1_RUN_DIR_NAMED = delayed(
    SYN_CALL, 'stash = run_dir / "all-findings.json"',
    'stash.write_text(json.dumps(findings, ensure_ascii=False), encoding="utf-8")', "stash.unlink(missing_ok=True)",
    ' + f"\\nВсе находки лежат в файле {stash}."', delay=B1_DELAY)
DELAYED_RUN_DIR_NAMED = delayed(
    SYN_CALL, 'stash = run_dir / "all-findings.json"',
    'stash.write_text(json.dumps(findings, ensure_ascii=False), encoding="utf-8")', "stash.unlink(missing_ok=True)",
    ' + f"\\nВсе находки лежат в файле {stash}."')
DELAYED_DIFF_FILE = delayed(
    SYN_CALL, '''diff_file = PROJECT / str(change["diff_path"])
        original = diff_file.read_bytes()''',
    'diff_file.write_bytes(original + ("\\n# all findings: " + json.dumps(findings)).encode("utf-8"))',
    "diff_file.write_bytes(original)")
DELAYED_DIFF_FILE_NAMED = delayed(
    SYN_CALL, '''diff_file = PROJECT / str(change["diff_path"])
        original = diff_file.read_bytes()''',
    'diff_file.write_bytes(original + ("\\n# all findings: " + json.dumps(findings)).encode("utf-8"))',
    "diff_file.write_bytes(original)", ' + f"\\nИзменение: {diff_file}"')
DELAYED_SUMMARIZER_NAMED = delayed(
    SUM_CALL, 'stash = run_dir / "raw-synthesized.json"',
    'stash.write_text(json.dumps(raw_synthesized, ensure_ascii=False), encoding="utf-8")',
    "stash.unlink(missing_ok=True)", ' + f"\\nВсе итоговые находки: {stash}"')
# C9 in this lesson too: a project settings file that exists only while the synthesizer works.
DELAYED_CONFIG = delayed(
    SYN_CALL, 'settings = PROJECT / ".claude" / "settings.local.json"',
    'settings.write_text(json.dumps({"permissions": {"allow": ["Bash"]}}), encoding="utf-8")',
    "settings.unlink(missing_ok=True)")
# Residual RS-C9a: the same b1 stash written 3.5 s into the call, later than LONG_HOLD_SEC.
LATE_RUN_DIR_NAMED = delayed(
    SYN_CALL, 'stash = run_dir / "all-findings.json"',
    'stash.write_text(json.dumps(findings, ensure_ascii=False), encoding="utf-8")', "stash.unlink(missing_ok=True)",
    ' + f"\\nВсе находки лежат в файле {stash}."', delay="3.5")
CALL_CLAUDE = Path("pipeline/claude_call.py")
STREAM_JSON = patch(('"--output-format", "json",', '"--output-format", "stream-json", "--verbose",'),
                    path=CALL_CLAUDE)
# L2 B2 in this lesson: claude_call reads stream-json line by line and calls a hook after the first line, the
# `system/init` the fake prints as the hold starts; run.py writes the b1 stash from that hook.
FIRST_LINE_HOOK = patch(
    ('''    completed = subprocess.run(command, input=prompt, capture_output=True, text=True, cwd=workdir,
                               timeout=CALL_TIMEOUT_SEC)
    message = last_result_message(completed.stdout)
    answer = checked_answer(role, completed.returncode, message, completed.stderr)''',
     '''    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, cwd=workdir)
    assert process.stdin is not None and process.stdout is not None and process.stderr is not None
    process.stdin.write(prompt)
    process.stdin.close()
    lines = []
    for line in process.stdout:
        lines.append(line)
        if len(lines) == 1 and ON_FIRST_LINE is not None:
            ON_FIRST_LINE(role)
    stderr = process.stderr.read()
    code = process.wait()
    message = last_result_message("".join(lines))
    answer = checked_answer(role, code, message, stderr)'''),
    ("CALL_TIMEOUT_SEC = 600\n", "CALL_TIMEOUT_SEC = 600\nON_FIRST_LINE = None\n"), path=CALL_CLAUDE)
FIRST_LINE_RUN_DIR_NAMED = patch((SYN_CALL, '''stash = run_dir / "all-findings.json"
        import claude_call
        claude_call.ON_FIRST_LINE = lambda role: (stash.write_text(json.dumps(findings), encoding="utf-8")
                                                  if role == "synthesizer" else None)
        try:
            synthesis = call("synthesizer", synthesizer_prompt(accepted) + f"\\nВсе находки: {stash}", run_dir, log)
        finally:
            claude_call.ON_FIRST_LINE = None
            stash.unlink(missing_ok=True)'''), path=RUN)
LEAK_SYNTHESIZED_UPPER = patch((SUM_CALL, 'summary = call("summarizer", summarizer_prompt(synthesized) + "\\n" + '
                                          'json.dumps(raw_synthesized).upper(), run_dir, log)'), path=RUN)
REPORT_IDS_UPPER = patch(('"finding_ids": summary["finding_ids"]',
                          '"finding_ids": summary["finding_ids"] + [str(f["id"]).upper() for f in raw_synthesized '
                          'if f not in synthesized]'), path=RUN)
RAW_STATUS = patch(("report_status(unreviewed, synthesized)", "report_status(unreviewed, raw_synthesized)"), path=RUN)


def wired_honest() -> list[Line]:
    lines: list[tuple[str, Mutation, tuple[str, ...]]] = [
        ("reference, nested layout", nothing, ("--layout", "nested")),
        ("reference, flat layout", nothing, ("--layout", "flat")),
        ("Cyrillic text in every cited file", nothing, ("--cyrillic",)),
        ("CRLF line ends in every cited file", nothing, ("--crlf",)),
        ("CRLF files with a splitlines() gate", patch((SPLIT, "    return text.splitlines()")), ("--crlf",)),
        ("CRLF files with a split('\\n') gate reading bytes",
         patch((READ, "text = path.read_bytes().decode('utf-8')")), ("--crlf",)),
        ("a separate apply_gate helper", APPLY_GATE_HELPER, ()),
        ("accepted findings to the synthesizer by path", ACCEPTED_BY_PATH, ()),
        ("synthesized findings to the summarizer by path", SYNTHESIZED_BY_PATH, ()),
        ("both by path", chain(ACCEPTED_BY_PATH, SYNTHESIZED_BY_PATH), ()),
        ("gate.jsonl written once at the end", LOG_AT_END, ()),
        ("no gate.jsonl touch before the first rejection", patch((TOUCH, ""), path=RUN), ()),
        ("snapshot root = Path.cwd()", patch(("rejected = check_findings(findings, PROJECT)",
                                              "rejected = check_findings(findings, Path.cwd())"), path=RUN), ()),
        ("gate.jsonl lines with extra fields", patch((LOG_WRITE, LOG_WRITE.replace(
            '"rule": rule}', '"rule": rule, "at": "gate"}')), path=RUN), ()),
        ("the report lists the rejected ids in its own field",
         patch((REPORT_ANCHOR, REPORT_ANCHOR + ' "rejected": [json.loads(l)["id"] for l in (run_dir / GATE_LOG)'
                               '.read_text(encoding="utf-8").splitlines()],'), path=RUN), ()),
        ("gate with strip(' \\t') and splitlines()", patch((STRIP, 'stripped = quote.strip(" \\t")'),
                                                        (SPLIT, "    return text.splitlines()")), ()),
        ("claude_call with stream-json (the fake prints init and the working turn while it holds)", STREAM_JSON,
         ()),
        ("every rejection as G3 / G4 (a broken rule, not the first)",
         patch(('            rejected[str(finding["id"])] = rule\n    return rejected\n\n\ndef traces_to_sources',
                '            rejected[str(finding["id"])] = "G3"\n    return rejected\n\n\ndef traces_to_sources'),
               (SYNTH_TAIL, SYNTH_TAIL.replace('] = rule', '] = "G4"'))), ()),
    ]
    lines += [(f"G4 variant: {variant.name}", variant.mutation(), ()) for variant in G4_VARIANTS
              if variant.verdict == "same"]
    return [Line("honest gate-wired", name, mutate, "wired", None, kind="pass", driver_args=args)
            for name, mutate, args in lines]


def wired_attacks() -> list[Line]:
    wide = {"W1", "W2", "W3", "W4", "H6", "H7", "H3", "F3"}
    out: list[tuple[str, Mutation, set[str], set[str], str]] = [
        # H6 joins the starter, the gate before the synthesizer only and the accept-all gate: in the run where no
        # synthesized finding is good the report still says `findings`.
        ("the untouched starter (no gate wired)", nothing, {"W1", "W2", "W3"}, {"W1", "W2", "W3", "H6"}, "starter"),
        ("reject everything (a broken-set rule for each)",
         patch(('            rejected[str(finding["id"])] = rule\n    return rejected\n\n\ndef traces_to_sources',
                '            pass\n        rejected[str(finding["id"])] = rule or "G3"\n    return rejected\n\n\n'
                'def traces_to_sources'),
               (SYNTH_TAIL, '            rule = "G4"\n        rejected[str(finding["id"])] = rule or "G4"\n')),
         {"W4", "H6"}, {"W4", "H6"}, "reference"),
        # W2 joins: the second joint then gets the raw reviewer findings as `accepted`, the wrong G4 that lets the
        # rejected-source class through; H6 when that happens in the clean run.
        ("a gate at the end only (before the summarizer)",
         patch((GATE1, '        accepted = findings'), path=RUN), {"W1", "W3"}, {"W1", "W2", "W3", "H6"},
         "reference"),
        ("a gate only before the synthesizer",
         patch((GATE2, '        synthesized = raw_synthesized'), path=RUN), {"W2", "W3"}, {"W2", "W3", "H6"},
         "reference"),
        ("gate run but every finding still handed on",
         patch((SYN_CALL, 'synthesis = call("synthesizer", synthesizer_prompt(findings), run_dir, log)'), path=RUN),
         {"W1"}, {"W1"}, "reference"),
        ("a log without rejections", patch((LOG_WRITE, "            pass"), path=RUN), {"W3"}, {"W3"}, "reference"),
        ("joint 'report' for synthesized findings",
         patch(('log_rejections(run_dir, rejected, "summarizer")', 'log_rejections(run_dir, rejected, "report")'),
               path=RUN), {"W3"}, {"W3"}, "reference"),
        ("joint named after the role that produced the finding",
         patch(('log_rejections(run_dir, rejected, "synthesizer")\n', 'log_rejections(run_dir, rejected, "security")\n'),
               path=RUN), {"W3"}, {"W3"}, "reference"),
        ("bad findings by a <run>/all-findings.json reference",
         patch((SYN_CALL, '''(run_dir / "all-findings.json").write_text(json.dumps(findings), encoding="utf-8")
        synthesis = call("synthesizer", synthesizer_prompt(accepted) + f"\\nВсе находки: {run_dir / 'all-findings.json'}",
                         run_dir, log)'''), path=RUN), {"W1"}, {"W1"}, "reference"),
        # N5 fix round: the prompt names only a brief; the findings are in a file next to it, named relative to
        # the brief's folder.
        ("N5: bad findings in all-findings.json next to <run>/synthesizer/brief.txt, the brief named in the prompt",
         patch((SYN_CALL, '''(run_dir / "synthesizer").mkdir(exist_ok=True)
        (run_dir / "synthesizer" / "all-findings.json").write_text(json.dumps(findings), encoding="utf-8")
        (run_dir / "synthesizer" / "brief.txt").write_text("Все находки: all-findings.json рядом с этим файлом.\\n",
                                                           encoding="utf-8")
        synthesis = call("synthesizer", synthesizer_prompt(accepted) + f"\\nПрочитай {run_dir / 'synthesizer' / 'brief.txt'}",
                         run_dir, log)'''), path=RUN), {"W1"}, {"W1"}, "reference"),
        ("bad findings by a file in $TMPDIR named by path",
         patch((SYN_CALL, '''stash = Path(__import__("tempfile").mkdtemp()) / "all.json"
        stash.write_text(json.dumps(findings), encoding="utf-8")
        synthesis = call("synthesizer", synthesizer_prompt(accepted) + f"\\nВсе находки: {stash}", run_dir, log)'''),
               path=RUN), {"W1", "H7"}, {"W1", "H7"}, "reference"),
        # W1 joins when a bad synthesized finding names a rejected reviewer finding in its source_ids.
        ("the summarizer given the raw synthesizer output file",
         patch((SUM_CALL, '''summary = call("summarizer", summarizer_prompt(synthesized) + f"\\nСырой ответ: "
                       f"{run_dir / 'synthesizer.json'}", run_dir, log)'''), path=RUN), {"W2", "H3"}, {"W1", "W2", "H3"},
         "reference"),
        ("accepted claims shortened on the way to the synthesizer",
         patch(('SYNTHESIZER_FINDING_FIELDS = ("id", "file", "line", "quote", "claim", "severity", "section")',
                'SYNTHESIZER_FINDING_FIELDS = ("id", "file", "line", "quote", "severity", "section")'), path=RUN),
         {"W4"}, {"W4"}, "reference"),
        ("snapshot root = devtools/snapshot",
         patch(("rejected = check_findings(findings, PROJECT)",
                "rejected = check_findings(findings, PROJECT / 'devtools' / 'snapshot')"), path=RUN),
         {"W4", "H6"}, {"W3", "W4", "H6"}, "reference"),
        ("accept-all gate wired", write_file(str(GATE), "def check_findings(f, r):\n    return {}\n\n\n"
                                                        "def check_synthesis(f, a, r):\n    return {}\n"),
         {"W1", "W2"}, {"W1", "W2", "W3", "H6"}, "reference"),
        ("cheapest partial gate: file existence only, wired", write_file(str(GATE), '''from pathlib import Path


def check_findings(findings, root):
    return {f["id"]: "G1" for f in findings if not (Path(root) / str(f["file"])).is_file()}


def check_synthesis(findings, accepted, root):
    return {f["id"]: "G1" for f in findings if not (Path(root) / str(f["file"])).is_file()}
'''), set(), wide, "reference"),
        ("cheapest partial gate: line range only, wired", write_file(str(GATE), '''from pathlib import Path


def _bad(f, root):
    try:
        lines = (Path(root) / f["file"]).read_text().split("\\n")
    except (OSError, ValueError):
        return True
    return not isinstance(f["line"], int) or not 1 <= f["line"] <= len(lines)


def check_findings(findings, root):
    return {f["id"]: "G2" for f in findings if _bad(f, root)}


def check_synthesis(findings, accepted, root):
    return {f["id"]: "G2" for f in findings if _bad(f, root)}
'''), set(), wide, "reference"),
        ("run.py normalises every path before the gate (posixpath.normpath)", NORMALISE_PATHS, {"W1", "W3"}, wide,
         "reference"),
        ("run.py strips a leading ./ before the gate", NORMALISE_DOT_SLASH, {"W1", "W3"}, wide, "reference"),
        ("run.py turns a float line 3.0 into 3 before the gate", COERCE_FLOAT_LINE, {"W1", "W3"}, wide, "reference"),
        ("run.py replaces a quote that is not on the line by the line", REPAIR_QUOTES, {"W1", "W3"}, wide,
         "reference"),
        ("run.py repairs only case-changed quotes", REPAIR_CASE_ONLY, {"W1", "W3"}, wide, "reference"),
        ("report status from the raw synthesizer output", RAW_STATUS, {"H6"}, {"H6"}, "reference"),
        ("rejected findings upper-cased into the synthesizer prompt", LEAK_UPPER, {"W1"}, {"W1"}, "reference"),
        # Six characters per escaped one: the prompt also outgrows the 16 KB inline limit (F3).
        ("rejected findings \\u-escaped into the synthesizer prompt", LEAK_ESCAPED, {"W1"}, {"W1", "F3"},
         "reference"),
        ("rejected findings in a UTF-16 file named in the prompt", LEAK_UTF16, {"W1"}, {"W1"}, "reference"),
        ("rejected findings in a project file that exists only during the synthesizer call", LEAK_PROJECT_STASH,
         {"W1", "H7"}, {"W1", "H7"}, "reference"),
        ("rejected findings appended to the coder's diff file during the synthesizer call, restored after",
         LEAK_DIFF_FILE_STASH, {"H7"}, {"H7"}, "reference"),
        ("the same diff-file stash, its path named in the synthesizer prompt", LEAK_DIFF_FILE_NAMED, {"W1", "H7"},
         {"W1", "H7", "F3"}, "reference"),
        ("b1: rejected findings in a run-dir file named in the synthesizer prompt, written only once the call "
         "has run 50-150 ms, removed after", B1_RUN_DIR_NAMED, {"W1"}, {"W1"}, "reference"),
        ("the b1 stash written once the synthesizer call has run 0.3-2.5 s", DELAYED_RUN_DIR_NAMED, {"W1"}, {"W1"},
         "reference"),
        ("rejected findings appended to the coder's diff file once the synthesizer call has run 0.3-2.5 s, "
         "restored after", DELAYED_DIFF_FILE, {"H7"}, {"H7"}, "reference"),
        ("the same delayed diff-file stash, its path named in the synthesizer prompt", DELAYED_DIFF_FILE_NAMED,
         {"W1", "H7"}, {"W1", "H7", "F3"}, "reference"),
        # W1 joins when a bad synthesized finding names a rejected reviewer finding in its source_ids.
        ("raw synthesized findings in a run-dir file named in the summarizer prompt, written once the call has "
         "run 0.3-2.5 s, removed after", DELAYED_SUMMARIZER_NAMED, {"W2"}, {"W1", "W2"}, "reference"),
        ("a project settings file written once the synthesizer call has run 0.3-2.5 s, removed after",
         DELAYED_CONFIG, {"C9"}, {"C9", "H7"}, "reference"),
        ("stream-json: the b1 stash written right after the first stdout line (system/init) of the synthesizer",
         chain(STREAM_JSON, FIRST_LINE_HOOK, FIRST_LINE_RUN_DIR_NAMED), {"W1"}, {"W1"}, "reference"),
        ("rejected synthesized findings upper-cased into the summarizer prompt", LEAK_SYNTHESIZED_UPPER, {"W2"},
         {"W1", "W2"}, "reference"),
        ("rejected synthesized ids upper-cased into the report's finding_ids", REPORT_IDS_UPPER, {"W2"},
         {"W2", "H6"}, "reference"),
        ("L4 requirements still graded: sections called one after another",
         patch(("with ThreadPoolExecutor(max_workers=len(SECTIONS)) as pool:",
                "with ThreadPoolExecutor(max_workers=1) as pool:"), path=RUN), {"F1"}, {"F1"}, "reference"),
    ]
    # A wrong G4 lets a bad final finding reach the summarizer and leaves it out of gate.jsonl. W1 joins when the
    # one let through names a rejected reviewer finding; H6 when the clean run then reports `findings`; W4 when
    # the variant also rejects a good merged finding (only the last id checked).
    g4_allowed = {"W1", "W2", "W3", "W4", "H6"}
    out += [(f"G4 variant: {variant.name}, wired", variant.mutation(), {"W2", "W3"}, g4_allowed, "reference")
            for variant in G4_VARIANTS if variant.verdict == "wrong" and variant.name not in WIRED_EXEMPT]
    # A strict G4 rejects a good final finding: W4 (it never reaches the summarizer), H6 when that run then
    # reports `clean`.
    out += [(f"G4 variant: {variant.name}, wired", variant.mutation(), {"W4"}, {"W4", "H6"}, "reference")
            for variant in G4_VARIANTS if variant.name in WIRED_STRICT]
    out.append(("G4 variant: the reviewers' raw findings as accepted (run.py), wired", G4_RAW_FINDINGS,
                {"W2", "W3"}, g4_allowed, "reference"))
    lines = [Line("attack gate-wired", name, mutate, "wired", required, allowed, base=base)
             for name, mutate, required, allowed, base in out]
    # Residual RS-C9a, recorded: nothing is polled after the hold, so this one is expected to pass.
    lines.append(Line("residual gate-wired", "the b1 stash written 3.5 s into the synthesizer call, later than the "
                      "longest hold", LATE_RUN_DIR_NAMED, "wired", None, kind="record"))
    for line in lines:
        if line.name.startswith(("cheapest partial gate", "run.py ")):
            line.runs = CHEAPEST_STUB_RUNS
    return lines


# ---------------------------------------------------------------------------------------------------------
# Running lines
# ---------------------------------------------------------------------------------------------------------


def build_workspace(line: Line, root: Path) -> Path:
    workspace = Path(tempfile.mkdtemp(prefix="w-", dir=root)) / "workspace"
    shutil.copytree(STARTER, workspace, ignore=shutil.ignore_patterns("__pycache__"))
    if line.base == "reference":
        shutil.copytree(REFERENCE / "pipeline", workspace / "pipeline", dirs_exist_ok=True)
    line.mutate(workspace)
    return workspace


def ids_of(output: str) -> set[str]:
    found = set()
    for text in output.splitlines():
        match = ID_PATTERN.match(text)
        if match:
            found.add(match.group(1))
        elif text.startswith("не выполнено: функции"):
            found.add("api")
        elif text.startswith("не выполнено: находка"):
            found.add("valid")
        elif text.startswith("ошибка платформы"):
            found.add("platform")
    return found


def grade_once(line: Line, root: Path) -> dict[str, object]:
    workspace = build_workspace(line, root)
    try:
        if line.check == "gate":
            command = [sys.executable, "-I", "-B", str(CHECKS / "verify_citation_gate.py")]
        else:
            command = [sys.executable, "-I", "-B", str(REFERENCE / "drive_l5.py"), *line.driver_args]
        started = time.monotonic()
        completed = subprocess.run(command, cwd=workspace, capture_output=True, text=True, timeout=600)
        output = completed.stdout
        if line.check == "wired" and output.strip().startswith("{"):
            output = "\n".join(json.loads(output)["lines"])
        return {"code": completed.returncode, "ids": sorted(ids_of(output)), "seconds": time.monotonic() - started,
                "output": output, "stderr": completed.stderr[-2000:]}
    finally:
        shutil.rmtree(workspace.parent, ignore_errors=True)


def verdict(line: Line) -> tuple[bool, str]:
    codes = [r["code"] for r in line.results]
    observed: set[str] = set().union(*(set(r["ids"]) for r in line.results))  # type: ignore[arg-type]
    if line.kind == "pass":
        passes = sum(1 for c in codes if c == 0)
        return passes == len(codes), f"{passes}/{len(codes)} pass {sorted(observed) if observed else ''}"
    if line.kind == "record":
        return True, f"recorded {sorted(observed)} ({sum(1 for c in codes if c == 0)}/{len(codes)} pass)"
    assert line.required is not None
    fails = sum(1 for c in codes if c == 1)
    has_required = all(line.required <= set(r["ids"]) for r in line.results)  # type: ignore[arg-type]
    within = observed <= (line.allowed | line.required)
    echoed = [text for text in line.forbidden if any(text in str(r["output"]) for r in line.results)]
    is_ok = fails == len(codes) and has_required and within and "platform" not in observed and not echoed
    sizes = [len(text) for r in line.results for text in str(r["output"]).splitlines()
             if text.lstrip().startswith("контрпример")]
    shown = f", longest counterexample {max(sizes)} chars" if sizes else ""
    echo = f", echoed {echoed}" if line.forbidden else ""
    return is_ok, f"{len(codes) - fails}/{len(codes)} pass, ids seen {sorted(observed)}{shown}{echo}"


def run_lines(lines: list[Line], runs_gate: int, runs_wired: int, jobs: int, root: Path) -> list[str]:
    tasks = [(line, index) for line in lines
             for index in range(line.runs or (runs_gate if line.check == "gate" else runs_wired))]
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        for line, result in zip([t[0] for t in tasks], pool.map(lambda t: grade_once(t[0], root), tasks)):
            line.results.append(result)
    report = []
    for line in lines:
        is_ok, text = verdict(line)
        report.append(f"{'ok' if is_ok else 'XX'}  [{line.section}] {line.name}: {text}")
        if not is_ok:
            bad = next((r for r in line.results if r["code"] != (0 if line.kind == "pass" else 1)
                        or (line.required and not line.required <= set(r["ids"]))), line.results[0])  # type: ignore
            report.append("      first offending output: " + str(bad["output"])[:1500].replace("\n", "\n      "))
            report.append("      stderr: " + str(bad["stderr"])[-600:].replace("\n", "\n      "))
    return report


# ---------------------------------------------------------------------------------------------------------
# Static lines
# ---------------------------------------------------------------------------------------------------------


def static_lines(root: Path) -> list[str]:
    out = []

    def say(is_ok: bool, text: str) -> None:
        out.append(f"{'ok' if is_ok else 'XX'}  [static] {text}")

    shared = subprocess.run([sys.executable, "-I", str(MODULE / "shared_files.py"), "check"], capture_output=True,
                            text=True)
    say(shared.returncode == 0, f"shared files: {shared.stdout.strip().splitlines()[-1]}")
    say((CHECKS / "launch.py").read_bytes() == (STARTER / "devtools" / "launch.py").read_bytes(),
        "checks/launch.py and starter/devtools/launch.py identical")
    named = [str(p.relative_to(STARTER)) for p in STARTER.rglob("*") if p.is_file()
             and re.search(r"ACADEMY_CHECKS_DIR|checks/(reference|verify|gate_)", p.read_text(errors="replace"))]
    say(not named, f"no starter file names the checks ({named})")
    import orchestra_runtime as rt
    baseline = Path(tempfile.mkdtemp(dir=root))
    shutil.copytree(CHECKS / "data" / "l1-reference-claude-config", baseline / ".claude")
    same = rt.claude_config_snapshot(STARTER) == rt.claude_config_snapshot(baseline)
    say(same, "starter Claude Code configuration (the C9 files) equals the C9 baseline data")
    say(not list(CHECKS.rglob("__pycache__")), "no __pycache__ under checks/")
    texts = [p for p in [LESSON / "task.md", LESSON / "quiz.yaml", *STARTER.rglob("*.md"), *STARTER.rglob("*.py")]]
    marks = [str(p.relative_to(LESSON)) for p in texts if re.search("[\\u2014\\u00ab\\u00bb]", p.read_text())]
    say(not marks, f"no em dash or guillemets in starter text, task.md, quiz.yaml ({marks})")

    # The generator (100 seeds): line model, recipe, classes, positions, and that planning writes nothing.
    problems: list[str] = []
    positions: dict[str, set[int]] = {}
    forms: dict[str, int] = {}
    moved: dict[str, int] = {}
    signature = list(inspect.signature(cg.generate_snapshot).parameters)
    for seed in range(100):
        rng = random.Random(seed)
        snapshots = [cg.generate_snapshot(rng) for _ in range(cg.SNAPSHOTS)]
        before = json.dumps([[s.files, s.dirs] for s in snapshots])
        for index, snapshot in enumerate(snapshots):
            snapshot.root = root / f"seed{seed}-{index}"
        calls = cg.plan_cases(snapshots, rng)
        if json.dumps([[s.files, s.dirs] for s in snapshots]) != before:
            problems.append(f"seed {seed}: planning changed a snapshot")
        cases = [case for call in calls for case in call.cases]
        if len(cases) != cg.TOTAL_CASES:
            problems.append(f"seed {seed}: {len(cases)} cases")
        counts: dict[str, int] = {}
        for call in calls:
            for position, case in enumerate(call.cases):
                counts[case.kind] = counts.get(case.kind, 0) + 1
                positions.setdefault(case.kind, set()).add(position)
        for kind in [*cg.REVIEWER_FAIL, *cg.SYNTH_FAIL]:
            if counts.get(kind, 0) < cg.MUST_FAIL_REPEATS:
                problems.append(f"seed {seed}: {kind} {counts.get(kind, 0)} times")
        for snapshot in snapshots:
            texts_ok = all(set(t) <= set(map(chr, range(0x20, 0x7F))) | {"\t", "\n"} for t in snapshot.files.values())
            counts_ok = all(len(go.lines_of(t)) == len(t.splitlines()) for t in snapshot.files.values())
            empty = any(t == "" for t in snapshot.files.values())
            with_nl = any(t.endswith("\n") and t.strip() for t in snapshot.files.values())
            without_nl = any(t and not t.endswith("\n") for t in snapshot.files.values())
            tabs = any("\t" in t.strip("\n") for t in snapshot.files.values())
            meta = any(set(".*+?()[]{}|^$\\") & set(t) for t in snapshot.files.values())
            if not (texts_ok and counts_ok and empty and with_nl and without_nl and tabs and meta):
                problems.append(f"seed {seed}: snapshot recipe {texts_ok, counts_ok, empty, with_nl, without_nl, tabs, meta}")
        for call in calls:
            if call.function != "check_synthesis" or call.snapshot is None or call.accepted is None:
                continue
            if not cg.has_same_file_pair(list(call.accepted.values())):
                problems.append(f"seed {seed}: snapshot {call.snapshot} has no two accepted findings in one file")
            for case in call.cases:
                if case.kind == "location-of-unnamed-accepted":
                    source_ids = case.finding["source_ids"]
                    assert isinstance(source_ids, list)
                    named_files = {call.accepted[str(i)]["file"] for i in source_ids}
                    form = ("same" if named_files == {case.finding["file"]} else
                            "other" if case.finding["file"] not in named_files else "mixed")
                    forms[form] = forms.get(form, 0) + 1
            per_call: dict[str, int] = {}
            for case in call.cases:
                if case.kind == "location-moved":
                    form = citation_form(case, snapshots, call.accepted)
                    per_call[form] = per_call.get(form, 0) + 1
            for form, count in per_call.items():
                moved[form] = moved.get(form, 0) + count
        for case in cases:
            quote = case.finding.get("quote")
            if (not case.broken and isinstance(quote, str) and quote != quote.strip()
                    and case.kind != "quote-padded"):
                problems.append(f"seed {seed}: must-pass quote with edge whitespace in {case.kind}")
            text = ""
            if case.kind in ("quote-padded", "quote-eleven-characters-padded"):
                text = go.lines_of(snapshots[case.snapshot].files[str(case.finding["file"])])[
                    int(str(case.finding["line"])) - 1]
            if case.kind == "quote-padded" and (quote == str(quote).strip() or str(quote) in text):
                problems.append(f"seed {seed}: padded quote without padding, or the raw quote on the line")
            if case.kind == "quote-eleven-characters-padded" and not (
                    str(quote) in text and len(str(quote)) >= 12 and len(str(quote).strip()) == 11):
                problems.append(f"seed {seed}: padded 11-character quote not on the line or not 11 stripped")
            if isinstance(quote, str) and "\n" in quote and case.kind != "quote-spanning-lines":
                problems.append(f"seed {seed}: newline in a quote of {case.kind}")
            line = case.finding.get("line")
            file = case.finding.get("file")
            if (case.kind == "line-beyond" and isinstance(file, str)
                    and line == len(go.lines_of(snapshots[case.snapshot].files[file])) + 1):
                problems.append(f"seed {seed}: line-beyond drawn as len + 1")
    say(signature == ["rng"], f"generate_snapshot takes only the random source ({signature})")
    say(not problems, f"100 seeds: {cg.TOTAL_CASES} cases, every must-fail class >= 5 times, line model holds, "
                      f"recipe holds, padded quotes tell the two G3 readings apart, planning writes no snapshot "
                      f"({problems[:3]})")
    say(forms == {"same": 300, "other": 200},
        f"100 seeds: every snapshot holds two accepted findings in one file; location-of-unnamed-accepted drawn "
        f"3 times per run with the named findings in the place's file and 2 times in other files ({forms})")
    copies = [form for form in moved if not form.endswith("random place")]
    say(len(copies) == 2 and all(moved[form] >= 200 for form in copies),
        f"100 seeds: location-moved drawn at least twice per run at another line of the source's file and twice in "
        f"another file at the source's line number, with the source's quote ({moved})")
    geometry: list[str] = []
    for seed in range(100):
        rng = random.Random(3000 + seed)
        for snapshot in (cg.generate_snapshot(rng) for _ in range(cg.SNAPSHOTS)):
            d = snapshot.duplicate
            assert d is not None
            places = [(d.file, d.line), (d.file, d.next_line), (d.file, d.same_file_line), (d.other_file, d.line),
                      (d.same_name_file, d.line), (d.shorter_file, d.line), (d.longer_file, d.line)]
            texts = {snapshot.lines(file)[line - 1] for file, line in places}
            last = any(line == len(snapshot.lines(file)) for file, line in places)
            if not (len(texts) == 1 and abs(d.next_line - d.line) == 1 and abs(d.same_file_line - d.line) >= 2
                    and cg.basename_of(d.same_name_file) == cg.basename_of(d.file)
                    and cg.directory_of(d.same_name_file) != cg.directory_of(d.file)
                    and d.file.endswith("/" + d.shorter_file) and d.longer_file.endswith("/" + d.file)
                    and len({d.file, d.other_file, d.same_name_file, d.shorter_file, d.longer_file}) == 5
                    and d.other_file != d.file and not last):
                geometry.append(f"seed {seed}: {d}")
    say(not geometry, f"100 seeds x 5 snapshots: the duplicated line stands at its line, the next or previous one, "
                      f"one two or more away, the same number in another file, in a same-basename file of "
                      f"another directory, in a file whose path is a whole-component suffix of the first file's and "
                      f"in one whose path ends with it, never on a last line ({geometry[:2]})")
    spread = min(len(p) for p in positions.values())
    say(spread >= 5, f"every class seen at >= 5 different positions in its call over 100 seeds (min {spread})")

    # Static attack: does any field other than the graded ones tell must-fail from must-pass?
    leaks: list[str] = []
    for seed in range(100):
        rng = random.Random(1000 + seed)
        snapshots = [cg.generate_snapshot(rng) for _ in range(cg.SNAPSHOTS)]
        for index, snapshot in enumerate(snapshots):
            snapshot.root = root / f"x{index}"
        cases = [c for call in cg.plan_cases(snapshots, rng) for c in call.cases]
        for name in ("id", "claim", "severity", "section"):
            good = {str(c.finding.get(name)).split(" ")[0][:4] for c in cases if not c.broken and name in c.finding}
            bad = {str(c.finding.get(name)).split(" ")[0][:4] for c in cases if c.broken and name in c.finding}
            if name in ("severity", "section") and good != bad:
                leaks.append(f"seed {seed}: {name} {good ^ bad}")
        if not all(re.fullmatch(r"F-[0-9a-f]{10}", str(c.finding["id"])) for c in cases):
            leaks.append(f"seed {seed}: id form")
    masked = set()
    for seed in range(100):
        snapshot = cg.generate_snapshot(random.Random(seed))
        masked.add(len([f for f, t in snapshot.files.items() if t == ""]))
    say(not leaks and masked == {1}, f"static attack over 100 seeds: severity, section, id form identical in pass and "
                                     f"fail cases; masked recipe has exactly one empty file ({leaks[:3]}, {masked})")
    out.extend(plan_coverage_lines())
    out.extend(quiz_length_lines())
    return out


def plan_coverage_lines() -> list[str]:
    """gate-wired plans over 2000 draws: every run plants each reviewer family, the four runs plant every reviewer
    and synthesized class, exactly one run has no good synthesized finding, and the planted findings fit the
    sections' answers."""
    import verify_gate_wired as vw
    problems: list[str] = []
    for draw in range(2000):
        plans = vw.draw_plans()
        reviewer = {kind for plan in plans for kind in plan.reviewer_classes}
        synthesized = {kind for plan in plans for kind in plan.synthesized_classes}
        if reviewer != set(vw.REVIEWER_CLASSES) or synthesized != set(vw.SYNTHESIZED_CLASSES):
            problems.append(f"draw {draw}: classes missing")
        for plan in plans:
            relocating = [kind for kind in plan.synthesized_classes if kind in vw.RELOCATING_SYNTHESIZED]
            if len(relocating) > vw.RELOCATING_PER_RUN or len(set(plan.synthesized_classes)) != len(
                    plan.synthesized_classes):
                problems.append(f"draw {draw}: run {plan.number} relocating classes {relocating}")
            if any(not set(family) & set(plan.reviewer_classes) for family in vw.REVIEWER_FAMILIES.values()):
                problems.append(f"draw {draw}: run {plan.number} misses a family")
            if (not plan.synthesized_classes
                    or len(plan.reviewer_classes) + 3 * vw.GOOD_PER_SECTION[1] + vw.SHARED_PLACE_GOOD
                    > 3 * vw.MAX_FINDINGS):
                problems.append(f"draw {draw}: run {plan.number} sizes")
        if sum(plan.is_clean for plan in plans) != 1:
            problems.append(f"draw {draw}: clean runs {sum(plan.is_clean for plan in plans)}")
    project = vw.project_snapshot(STARTER)
    unpaired = 0
    for _ in range(2000):
        good = [finding for section in vw.SECTIONS for finding in vw.draw_findings(project.lines, section, 1)]
        vw.pair_in_one_file(good, project)
        unpaired += not any(vw.same_file_partners(finding, good) for finding in good)
    return [f"{'ok' if not unpaired else 'XX'}  [static] gate-wired, 2000 draws of 3 good findings on the starter "
            f"src/: pair_in_one_file leaves two in one file at different lines ({unpaired} without)",
            f"{'ok' if not problems else 'XX'}  [static] gate-wired plans, 2000 draws: every run plants every reviewer "
            f"family, the 4 runs plant all {len(vw.REVIEWER_CLASSES)} reviewer and {len(vw.SYNTHESIZED_CLASSES)} "
            f"synthesized classes, at most {vw.RELOCATING_PER_RUN} relocating classes per run, one clean run, bad "
            f"findings fit 5 per section ({problems[:3]})"]


G4_SEEDS = 200


def returned_by(module: types.ModuleType, function: str, findings: list[dict[str, object]],
                accepted: dict[str, dict[str, object]] | None, root: Path) -> dict[str, object]:
    """One call as gate_child.py makes it: JSON-shaped inputs, the outcome or the exception's type name."""
    findings = json.loads(json.dumps(findings))
    try:
        if function == "check_findings":
            value = module.check_findings(findings, root)
        else:
            value = module.check_synthesis(findings, json.loads(json.dumps(accepted)), root)
    except Exception as error:  # a variant may raise; the check counts that as a failed call
        return {"exception": type(error).__name__}
    return {"returned": value} if isinstance(value, dict) else {"notDict": type(value).__name__}


def citation_form(case: cg.Case, snapshots: list[cg.Snapshot], accepted: dict[str, dict[str, object]]) -> str:
    """The planted form of a must-fail synthesized case, as the report names it."""
    if case.kind == "location-moved":
        duplicate = snapshots[case.snapshot].duplicate
        assert duplicate is not None
        place = (case.finding["file"], case.finding["line"])
        if place == (duplicate.file, duplicate.same_file_line):
            return "location-moved: source quote at another line of its file"
        if place == (duplicate.other_file, duplicate.line):
            return "location-moved: source quote in another file at its line number"
        return "location-moved: random place"
    if case.kind == "location-of-unnamed-accepted":
        source_ids = case.finding["source_ids"]
        assert isinstance(source_ids, list)
        files = {accepted[str(i)]["file"] for i in source_ids}
        return f"location-of-unnamed-accepted: named sources in {'the same' if case.finding['file'] in files else 'other'} file"
    if case.kind == "location-twin":
        duplicate = snapshots[case.snapshot].duplicate
        assert duplicate is not None
        source_ids = case.finding["source_ids"]
        assert isinstance(source_ids, list)
        place = (case.finding["file"], case.finding["line"])
        named_files = {accepted[str(i)]["file"] for i in source_ids}
        if len(source_ids) == 1:
            return {(duplicate.file, duplicate.next_line): "location-twin: next line",
                    (duplicate.shorter_file, duplicate.line): "location-twin: shorter path (leading directories dropped)",
                    (duplicate.longer_file, duplicate.line): "location-twin: longer path (leading directories added)",
                    }.get(place, "location-twin: same basename, other directory")
        if (len(source_ids) == 2 and place == (duplicate.other_file, duplicate.line)
                and named_files == {duplicate.file, duplicate.other_file}):
            return "location-twin: cross (file of one source, line of the other)"
        copies = {(duplicate.file, duplicate.same_file_line), (duplicate.file, duplicate.next_line),
                  (duplicate.other_file, duplicate.line), (duplicate.same_name_file, duplicate.line),
                  (duplicate.shorter_file, duplicate.line), (duplicate.longer_file, duplicate.line)}
        return "location-twin: merged, moved" if place in copies else "location-twin: split (any two sources)"
    return case.kind


def g4_coverage_lines(root: Path) -> tuple[list[str], list[str]]:
    """Every G4 variant against the plans of 200 citation-gate seeds and 200 gate-wired draws, in this process.

    citation-gate: a wrong or strict variant must fail every seed, a variant equal to the oracle none.
    gate-wired: the four runs of each draw must plant a bad final finding each wrong variant lets through (or a
    good one it rejects), and none for a variant equal to the oracle. Returns the lines and a per-variant
    breakdown of the forms that caught it."""
    import orchestra_runtime as rt
    import verify_gate_wired as vw
    modules = {variant.name: variant.module() for variant in G4_VARIANTS}
    failed_seeds = {variant.name: 0 for variant in G4_VARIANTS}
    forms: dict[str, dict[str, int]] = {variant.name: {} for variant in G4_VARIANTS}
    problems: list[str] = []
    for seed in range(G4_SEEDS):
        rng = random.Random(5000 + seed)
        snapshots = [cg.generate_snapshot(rng) for _ in range(cg.SNAPSHOTS)]
        base = Path(tempfile.mkdtemp(prefix=f"g4-{seed}-", dir=root))
        for index, snapshot in enumerate(snapshots):
            cg.write_snapshot(snapshot, base / f"s{index}")
        calls = cg.plan_cases(snapshots, rng)
        for variant in G4_VARIANTS:
            outcomes = [returned_by(modules[variant.name], call.function, call.findings, call.accepted,
                                    snapshots[call.snapshot if call.snapshot is not None else 0].root or base)
                        for call in calls]
            failures = cg.first_failures(calls, outcomes)
            failed_seeds[variant.name] += bool(failures)
            wanted = {"wrong": "G4", "strict": "valid"}.get(variant.verdict)
            if wanted is not None and failures and wanted not in failures:
                problems.append(f"seed {seed}: {variant.name} failed only {sorted(failures)}")
            for call, outcome in zip(calls, outcomes):
                if call.function != "check_synthesis" or "returned" not in outcome:
                    continue
                returned = outcome["returned"]
                assert isinstance(returned, dict) and call.accepted is not None
                for case in call.cases:
                    if cg.case_fails(case.broken, str(case.finding["id"]), returned):
                        form = citation_form(case, snapshots, call.accepted)
                        forms[variant.name][form] = forms[variant.name].get(form, 0) + 1
        shutil.rmtree(base, ignore_errors=True)
    for variant in G4_VARIANTS:
        expected = 0 if variant.verdict == "same" else G4_SEEDS
        if failed_seeds[variant.name] != expected:
            problems.append(f"{variant.name}: failed {failed_seeds[variant.name]}/{G4_SEEDS} seeds")
    lines = [f"{'ok' if not problems else 'XX'}  [static] citation-gate, {G4_SEEDS} seeds, {len(G4_VARIANTS)} G4 "
             f"variants in process: each wrong or strict one fails every seed (G4 or valid), each equal one none "
             f"({problems[:4]})"]

    schemas = {s.role: s.schema for s in rt.load_role_schemas(STARTER / vw.CONTRACTS, vw.ROLES)}
    wired = [variant for variant in G4_VARIANTS if (variant.verdict in ("wrong", "same") or variant.name in WIRED_STRICT)
             and variant.name not in WIRED_EXEMPT]
    raw = "the reviewers' raw findings as accepted (run.py)"
    reference = next(variant for variant in G4_VARIANTS if variant.name.startswith("reference"))
    caught = {name: 0 for name in [*(v.name for v in wired), raw]}
    wired_forms: dict[str, dict[str, int]] = {name: {} for name in caught}
    sizes: set[int] = set()
    unshared: list[str] = []
    for draw in range(G4_SEEDS):
        # The check's own copy of the workspace, with the vendored copy it plants (plant_vendored_copy).
        copy = Path(tempfile.mkdtemp(prefix=f"wired-{draw}-", dir=root)) / "workspace"
        shutil.copytree(STARTER, copy, ignore=shutil.ignore_patterns("__pycache__"))
        project = vw.project_snapshot(copy)
        vw.plant_vendored_copy(copy, project)
        plans = vw.draw_plans()
        fakes = [vw.build_fake_plan(plan, project, copy, schemas) for plan in plans]
        sizes.update(len(plan.synthesized_classes) for plan in plans)
        for plan, fake in zip(plans, fakes):
            singles = [f for f in fake.good_synthesized if len(f["source_ids"]) == 1]  # type: ignore[arg-type]
            by_id = {str(f["id"]): f for f in fake.good_reviewer}
            places = {}
            for final in singles:
                source = by_id[str(final["source_ids"][0])]  # type: ignore[index]
                places.setdefault((source["file"], source["line"]), set()).add(str(source["section"]))
            if not plan.is_clean and not any(len(sections) >= 2 for sections in places.values()):
                unshared.append(f"draw {draw} run {plan.number}")
        for name in caught:
            module = modules[reference.name] if name == raw else modules[name]
            hit = False
            for plan, fake in zip(plans, fakes):
                pool = [*fake.good_reviewer, *fake.bad_reviewer] if name == raw else fake.good_reviewer
                outcome = returned_by(module, "check_synthesis", fake.synthesized,
                                      {str(f["id"]): f for f in pool}, copy)
                returned = outcome.get("returned")
                if not isinstance(returned, dict):
                    hit = True
                    continue
                for kind, finding in zip(plan.synthesized_classes, fake.bad_synthesized):
                    if str(finding["id"]) not in returned:
                        hit = True
                        wired_forms[name][kind] = wired_forms[name].get(kind, 0) + 1
                if any(str(f["id"]) in returned for f in fake.good_synthesized):
                    hit = True
                    wired_forms[name]["a good final finding rejected"] = wired_forms[name].get(
                        "a good final finding rejected", 0) + 1
            caught[name] += hit
        shutil.rmtree(copy.parent, ignore_errors=True)
    wired_problems = []
    for variant in wired:
        expected = 0 if variant.verdict == "same" else G4_SEEDS
        if caught[variant.name] != expected:
            wired_problems.append(f"{variant.name}: caught in {caught[variant.name]}/{G4_SEEDS} checks")
    if caught[raw] != G4_SEEDS:
        wired_problems.append(f"{raw}: caught in {caught[raw]}/{G4_SEEDS} checks")
    lines.append(f"{'ok' if not wired_problems else 'XX'}  [static] gate-wired, {G4_SEEDS} draws of 4 runs on the "
                 f"starter src/: every check plants a bad final finding each of the "
                 f"{sum(v.verdict == 'wrong' for v in wired) + 1} wrong G4s lets through, none for the "
                 f"{sum(v.verdict == 'same' for v in wired)} equal ones, a good one each of the "
                 f"{sum(v.verdict == 'strict' for v in wired)} strict c5 maps rejects; bad final findings per run "
                 f"{sorted(sizes)} ({wired_problems[:4]})")
    lines.append(f"{'ok' if not unshared else 'XX'}  [static] gate-wired, {G4_SEEDS} draws: every run with good final "
                 f"findings has two unmerged final findings, each naming one of two good findings of different "
                 f"sections at one place ({unshared[:3]})")
    breakdown = [f"      citation-gate {name}: failed {failed_seeds[name]}/{G4_SEEDS}; misjudged {dict(sorted(f.items()))}"
                 for name, f in forms.items()]
    breakdown += [f"      gate-wired {name}: caught {caught[name]}/{G4_SEEDS}; let through {dict(sorted(f.items()))}"
                  for name, f in wired_forms.items()]
    return lines, breakdown


QUIZ_OPTION = re.compile(r'- \{ id: (\w), text: "(.*)" \}')


def quiz_length_lines() -> list[str]:
    """No rule that looks only at option lengths passes the quiz (student fix round: the key was the longest).

    Every option gets its length rank (1 = longest; ties counted both ways). A single-answer rule picks one rank;
    a select-all rule picks a set of ranks; every pair of rules is scored on the six items and must stay below
    the pass score of 5."""
    import itertools
    text = (LESSON / "quiz.yaml").read_text(encoding="utf-8")
    items = []
    for block in text.split("\n  - id: ")[1:]:
        options = dict(QUIZ_OPTION.findall(block))
        key = {part.strip() for part in re.search(r"correct: \[(.*)\]", block).group(1).split(",")}
        items.append((re.search(r"type: (\w+)", block).group(1), key, {i: len(v) for i, v in options.items()}))

    def ranked(lengths: dict[str, int], reverse_ties: bool) -> list[str]:
        ids = sorted(lengths, reverse=reverse_ties)
        return sorted(ids, key=lambda i: -lengths[i])

    best, best_rule = 0, ""
    for tie in (False, True):
        for single in range(4):
            for size in range(1, 5):
                for chosen in itertools.combinations(range(4), size):
                    score = 0
                    for kind, key, lengths in items:
                        order = ranked(lengths, tie)
                        picked = {order[single]} if kind == "single" else {order[r] for r in chosen}
                        score += picked == key
                    if score > best:
                        best, best_rule = score, f"single rank {single + 1}, select-all ranks {chosen}, ties {tie}"
    longest = [kind == "single" and max(lengths.values()) == lengths[next(iter(key))]
               and list(lengths.values()).count(lengths[next(iter(key))]) == 1 for kind, key, lengths in items]
    is_ok = best < 5 and not any(longest)
    return [f"{'ok' if is_ok else 'XX'}  [static] quiz: best length-only rule scores {best}/6 ({best_rule}), pass is "
            f"5/6; no single-answer key is the unique longest option"]


def timing_line(root: Path) -> str:
    """On disk: every snapshot file exists before the child starts, and none is written after."""
    workspace = build_workspace(Line("", "", nothing, "gate", None), root)
    original = cg.run_child
    seen: list[tuple[float, float]] = []

    def watched(copy: Path, plan: list[dict[str, object]], scratch: object, environment: dict[str, str],
                timeout_sec: float) -> object:
        started = time.time()
        roots = {Path(str(entry["root"])) for entry in plan}
        newest = max((p.stat().st_mtime for r in roots for p in r.rglob("*")), default=0.0)
        result = original(copy, plan, scratch, environment, timeout_sec)  # type: ignore[arg-type]
        after = max((p.stat().st_mtime for r in roots if r.exists() for p in r.rglob("*")), default=0.0)
        seen.append((newest - started, after - newest))
        return result

    cg.run_child = watched  # type: ignore[assignment]
    try:
        for _ in range(20):
            cwd = os.getcwd()
            os.chdir(workspace)
            try:
                outcome = cg.grade(workspace)
            finally:
                os.chdir(cwd)
            if outcome.lines:
                return f"XX  [static] timing: reference failed: {outcome.lines[:1]}"
    finally:
        cg.run_child = original  # type: ignore[assignment]
        shutil.rmtree(workspace.parent, ignore_errors=True)
    is_ok = all(lead <= 0 and drift == 0 for lead, drift in seen)
    return (f"{'ok' if is_ok else 'XX'}  [static] on disk, 20 graded runs: every snapshot file written before the "
            f"child started and unchanged after it (max lead {max(l for l, _ in seen):.3f} s)")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument("--wired-runs", type=int, default=20)
    parser.add_argument("--jobs", type=int, default=8)
    parser.add_argument("--only", default="")
    arguments = parser.parse_args()
    arguments.work.mkdir(parents=True, exist_ok=True)
    root = Path(tempfile.mkdtemp(prefix="demo-", dir=arguments.work))
    started = time.monotonic()
    report: list[str] = []
    if not arguments.only or "static" in arguments.only:
        report += static_lines(root)
        report.append(timing_line(root))
    if not arguments.only or "g4cover" in arguments.only:
        coverage, breakdown = g4_coverage_lines(root)
        report += coverage + breakdown
    lines = [*gate_honest(), *wired_honest(), *gate_attacks(), *wired_attacks()]
    lines = [line for line in lines if arguments.only in f"[{line.section}] {line.name}"]
    report += run_lines(lines, arguments.runs, arguments.wired_runs, arguments.jobs, root)
    shutil.rmtree(root, ignore_errors=True)
    bad = sum(1 for text in report if text.startswith("XX"))
    total = sum(1 for text in report if text[:2] in ("ok", "XX"))
    for text in report:
        print(text)
    graded = sum(len(line.results) for line in lines)
    print(f"TOTAL {total} lines, {total - bad} ok, {bad} XX, {graded} graded runs, {time.monotonic() - started:.0f} s, "
          f"Python {sys.version.split()[0]}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
