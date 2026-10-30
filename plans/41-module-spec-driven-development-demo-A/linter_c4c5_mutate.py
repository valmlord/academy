"""Write one mutant of the reference linter per rule removed or overreached."""
import sys
from pathlib import Path

source = Path(sys.argv[1]).read_text()
out = Path(sys.argv[2])
MUTANTS = {
    "no_status_missing": [('        adr.problems.append("нужна ровно одна строка `Status: ...`")\n',
                           '        adr.status = "accepted"\n')],
    "no_status_invalid": [('STATUS_NYGARD = re.compile(r"^(proposed|accepted|deprecated|superseded by ADR-(\\d{4}))$")',
                           'STATUS_NYGARD = re.compile(r"^(\\w+|superseded by ADR-(\\d{4}))$")')],
    "no_duplicate": [("        duplicate = numbers.count(adr.file_number) > 1\n", "        duplicate = False\n")],
    "duplicate_later_only": [("        duplicate = numbers.count(adr.file_number) > 1\n",
                              "        duplicate = adr.file_number in [a.file_number for a in root.adrs[:root.adrs.index(adr)]]\n")],
    "no_title": [('        title_mismatch = adr.shape == "nygard" and adr.title_number != adr.file_number\n',
                  "        title_mismatch = False\n")],
    "no_self_supersede": [(" or adr.superseded_by == adr.file_number:", ":")],
    "c5_skip_headings": [("            if fenced:\n                continue\n            for number in ADR_ID",
                          "            if fenced or line.startswith('#'):\n                continue\n            for number in ADR_ID")],
    "c5_skip_check": [("            if fenced:\n                continue\n            for number in ADR_ID",
                       "            if fenced or line.startswith('Check:'):\n                continue\n            for number in ADR_ID")],
    "c5_via_c6_regions": [("        lines = text.split(\"\\n\")\n        for line, fenced in zip(lines, fenced_line_flags(lines)):\n            if fenced:\n                continue\n            for number in ADR_ID",
                           "        for _, line in scanned_regions(text):\n            for number in ADR_ID")],
    "over_reject_proposed": [('STATUS_NYGARD = re.compile(r"^(proposed|accepted|deprecated|',
                              'STATUS_NYGARD = re.compile(r"^(accepted|')],
    "over_any_md_is_adr": [('ADR_FILE = re.compile(r"^(\\d{4})-.+\\.md$")', 'ADR_FILE = re.compile(r"^(\\d{4})?-?.+\\.md$")'),
                           ("int(match.group(1))", "int(match.group(1) or (re.search(r'ADR-(\\d{4})', path.read_text()) or [0, 0])[1])")],
    "over_title_last_number": [('NYGARD_TITLE = re.compile(r"^# ADR-(\\d{4}): \\S")', 'NYGARD_TITLE = re.compile(r"^# .*ADR-(\\d{4})")')],
    "over_self_supersede_any_later": [(" or adr.superseded_by == adr.file_number:", " or (adr.superseded_by is not None and adr.superseded_by != adr.file_number + 1):")],
    "over_c5_fences": [("            if fenced:\n                continue\n            for number in ADR_ID", "            for number in ADR_ID")],
    "over_c5_any_check": [("                if f\"ADR-{number}\" in retired:", "                if f\"ADR-{number}\" in retired or line.startswith('Check:'):")],
}
for name, edits in MUTANTS.items():
    text = source
    for old, new in edits:
        assert text.count(old) >= 1, (name, old)
        text = text.replace(old, new)
    (out / f"{name}.py").write_text(text)
