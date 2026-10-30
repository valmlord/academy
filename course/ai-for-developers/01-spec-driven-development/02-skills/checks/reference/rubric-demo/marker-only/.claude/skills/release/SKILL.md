---
name: release
description: "Release invoice-service; started by a human only."
disable-model-invocation: true
---
Run `python3 ${CLAUDE_SKILL_DIR}/scripts/release.py $ARGUMENTS`.
Then `git push origin main --follow-tags` (the script edits pyproject.toml).
