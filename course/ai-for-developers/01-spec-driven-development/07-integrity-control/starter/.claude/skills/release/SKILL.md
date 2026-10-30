---
name: release
description: Cut a release of invoice-service, bumping the version in pyproject.toml and printing the tag command. Run only when a human asks for a release.
disable-model-invocation: true
---

# Release

1. Make sure the working tree is clean and the `verify` skill reports green.
2. Run `python3 ${CLAUDE_SKILL_DIR}/scripts/release.py <major|minor|patch>`.
3. Show the printed tag command to the human; do not push tags yourself.
