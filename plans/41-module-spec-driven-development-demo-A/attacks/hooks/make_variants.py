"""Write must-fail and near-miss variants of the L1 reference hook (one edit each) next to this file."""

from pathlib import Path

HERE = Path(__file__).resolve().parent
REF = Path(__file__).resolve().parents[4] / "course/ai-for-developers/01-spec-driven-development/01-verification/checks/reference/.claude/hooks/stop_tests.py"
src = REF.read_text()
BLOCK = '''def block(reason: str) -> int:
    print(json.dumps({"decision": "block", "reason": reason}))
    return 0
'''
assert BLOCK in src


def with_block(body: str) -> str:
    return src.replace(BLOCK, "def block(reason: str) -> int:\n" + body)


V = {
    # must fail
    "mf_exit1_stderr": with_block("    sys.stderr.write(reason)\n    return 1\n"),
    "mf_exit2_raw": with_block("    sys.stderr.write(reason)\n    return 2\n"),
    "mf_child_isolated": src.replace("[sys.executable, *TEST_COMMAND]", "[sys.executable, \"-I\", *TEST_COMMAND]"),
    "mf_no_pythonpath": src.replace('env = {**os.environ, "PYTHONPATH": os.path.join(root, "src")}', "env = dict(os.environ)"),
    "mf_continue_false_exit0": with_block('    print(json.dumps({"decision": "block", "reason": reason, "continue": False}))\n    return 0\n'),
    "mf_continue_false_exit2": with_block('    print(json.dumps({"decision": "block", "reason": reason, "continue": False}))\n    return 2\n'),
    "mf_approve_on_green": src.replace("    return 0\n\n\nif __name__", '    print(json.dumps({"decision": "approve"}))\n    return 0\n\n\nif __name__'),
    "mf_block_without_reason": with_block('    print(json.dumps({"decision": "block"}))\n    return 0\n'),
    "mf_names_in_system_message": with_block('    print(json.dumps({"systemMessage": reason}))\n    return 0\n'),
    "mf_plain_text": with_block("    print(reason)\n    return 0\n"),
    "mf_json_array": with_block('    print(json.dumps([{"decision": "block", "reason": reason}]))\n    return 0\n'),
    "mf_two_objects": with_block('    print(json.dumps({"decision": "block", "reason": reason}))\n    print(json.dumps({"decision": "block", "reason": reason}))\n    return 0\n'),
    "mf_exit2_plain_stdout": with_block("    print(reason)\n    return 2\n"),
    "mf_hook_specific_output_green": src.replace("    return 0\n\n\nif __name__", '    print(json.dumps({"hookSpecificOutput": {"hookEventName": "Stop", "additionalContext": "ok"}}))\n    return 0\n\n\nif __name__'),
    "mf_exit2_on_green": src.replace("    return 0\n\n\nif __name__", '    sys.stderr.write("done")\n    return 2\n\n\nif __name__'),
    "mf_first_name_only": with_block('    import re as _re\n    first = _re.search(r"^(FAIL|ERROR): .*$", reason, _re.M)\n    print(json.dumps({"decision": "block", "reason": first.group(0) if first else reason[:200]}))\n    return 0\n'),
    "mf_exit_code_only": src.replace("    if ZERO_TESTS.search(output):\n", "    if False:\n"),
    "mf_always_block": src.replace("    return 0\n\n\nif __name__", '    return block("not sure")\n\n\nif __name__'),
    "mf_trust_last_message": src.replace("    if stop_hook_active():\n        return 0\n",
        "    raw = sys.stdin.read()\n    try:\n        payload = json.loads(raw)\n    except ValueError:\n        payload = {}\n    if isinstance(payload, dict) and payload.get(\"stop_hook_active\") is True:\n        return 0\n    message = payload.get(\"last_assistant_message\", \"\") if isinstance(payload, dict) else \"\"\n    if \"проходят\" in message or not message:\n        return 0\n    return block(\"agent says red\")\n"),
    "mf_ignore_active": src.replace("    if stop_hook_active():\n        return 0\n", "    stop_hook_active()\n"),
    "mf_missing_key_true": src.replace('return isinstance(payload, dict) and payload.get("stop_hook_active") is True',
                                       'return isinstance(payload, dict) and payload.get("stop_hook_active", True) is True'),
    "mf_crash_on_nonjson": src.replace("    try:\n        payload = json.loads(sys.stdin.read())\n    except ValueError:\n        return False\n", "    payload = json.loads(sys.stdin.read())\n"),
    "mf_hardcoded_ran0": src.replace("    return 0\n\n\nif __name__", '    return block("Ran 0 tests")\n\n\nif __name__').replace("    if stop_hook_active():\n        return 0\n", "    if stop_hook_active():\n        return 0\n    return block(\"Ran 0 tests\")\n"),
    # near-miss, must pass
    "nm_pretty_json": with_block('    print(json.dumps({"decision": "block", "reason": reason}, indent=2))\n    return 0\n'),
    "nm_json_exit2_stderr": with_block('    print(json.dumps({"decision": "block", "reason": reason}))\n    sys.stderr.write("blocked")\n    return 2\n'),
    "nm_json_exit1": with_block('    print(json.dumps({"decision": "block", "reason": reason}))\n    return 1\n'),
    "nm_exit2_names_only": with_block('    import re as _re\n    names = _re.findall(r"^(?:FAIL|ERROR): (\\S+(?: \\([^)]*\\))?)", reason, _re.M)\n    sys.stderr.write("\\n".join(names) if names else reason.splitlines()[-1] if "Ran 0 tests" not in reason else "Ran 0 tests")\n    return 2\n'),
    "nm_exit2_system_message": with_block('    import re as _re\n    names = _re.findall(r"^(?:FAIL|ERROR): (\\S+(?: \\([^)]*\\))?)", reason, _re.M)\n    print(json.dumps({"systemMessage": "red"}))\n    sys.stderr.write("\\n".join(names) if names else "Ran 0 tests")\n    return 2\n'),
    "nm_allow_empty_object": src.replace("    return 0\n\n\nif __name__", "    print(\"{}\")\n    return 0\n\n\nif __name__"),
    "nm_allow_continue_true": src.replace("    return 0\n\n\nif __name__", '    print(json.dumps({"continue": True, "suppressOutput": True, "systemMessage": "green"}))\n    return 0\n\n\nif __name__'),
    "nm_python3_on_path": src.replace("[sys.executable, *TEST_COMMAND]", '["python3", *TEST_COMMAND]'),
    "nm_tmpfile": src.replace("    output = run.stderr + run.stdout\n", "    output = run.stderr + run.stdout\n    import tempfile as _t\n    with _t.NamedTemporaryFile(\"w\", delete=False) as handle:\n        handle.write(output)\n"),
}
for name, text in V.items():
    assert text != src or name.startswith("nm_"), name
    (HERE / f"{name}.py").write_text(text)
print(len(V))
