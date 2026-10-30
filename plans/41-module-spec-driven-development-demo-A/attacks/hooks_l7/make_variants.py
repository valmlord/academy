"""Write L7 hook variants (one edit of the L7 reference hook each) and static attackers adapted to L7."""

from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = Path(__file__).resolve().parents[4]
REF = ROOT / "course/ai-for-developers/01-spec-driven-development/07-integrity-control/checks/reference/.claude/hooks/stop_tests.py"
src = REF.read_text()
LINT_BLOCK = '''    if linter.returncode != 0:
        return block(f"The artifact linter exited with {linter.returncode}:\\n{linter.stdout}{linter.stderr}")
'''
assert LINT_BLOCK in src
TESTS_PART = src[src.index("    tests = run("):src.index("    linter = run(")]


def lint(body: str) -> str:
    return src.replace(LINT_BLOCK, body)


V = {
    "mf_token_in_system_message": lint('    if linter.returncode != 0:\n        print(json.dumps({"systemMessage": linter.stdout + linter.stderr}))\n'),
    "mf_token_plain_stdout": lint('    if linter.returncode != 0:\n        print(linter.stdout + linter.stderr)\n'),
    "mf_continue_false": lint('    if linter.returncode != 0:\n        print(json.dumps({"continue": False, "stopReason": linter.stdout + linter.stderr}))\n'),
    "mf_exit2_treated_clean": lint('    if linter.returncode == 1:\n        return block(linter.stdout)\n'),
    "mf_stdout_only": lint('    if linter.returncode != 0:\n        return block("linter: " + linter.stdout)\n'),
    "mf_exit_code_ignored": lint('    if linter.stdout.strip() == "":\n        return 0\n'),
    "mf_token_dropped": lint('    if linter.returncode != 0:\n        return block("The artifact linter found problems.")\n'),
    "mf_fixed_usage_text": lint('    if linter.returncode == 2:\n        return block("usage: check_artifacts.py <root>")\n    if linter.returncode == 1:\n        return block(linter.stdout)\n'),
    "mf_linter_first_early_allow": src.replace(TESTS_PART, "").replace(LINT_BLOCK, LINT_BLOCK + "    return 0\n").replace(
        "    linter = run(", "    tests = None\n    linter = run(") + "",
    "mf_l1_hook_only": (ROOT / "course/ai-for-developers/01-spec-driven-development/01-verification/checks/reference/.claude/hooks/stop_tests.py").read_text(),
    "mf_grep_stub_source": lint('    stub = open(os.path.join(root, LINTER)).read()\n    if "print(" in stub:\n        return block(stub)\n'),
    "nm_stderr_exit2": lint('    if linter.returncode != 0:\n        sys.stderr.write(linter.stdout + linter.stderr)\n        return 2\n'),
    "nm_joined_reason": lint('    if linter.returncode != 0:\n        return block("tests: green\\nlinter:\\n" + linter.stdout + "\\n" + linter.stderr)\n'),
}
for name, text in V.items():
    (HERE / f"{name}.py").write_text(text)
print(len(V))
