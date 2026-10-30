---
name: release
description: Release invoice-service - bump the version, tag it and publish release notes. Started by a human only.
disable-model-invocation: true
argument-hint: "[major|minor|patch]"
---

# Release

Only a human starts a release. Never on Fridays or in the last week of a quarter.

1. Check: clean working tree, on `main`, up to date with origin.
2. Run the whole suite (the `verify` skill); never release from a red build.
3. Bump the version: `python3 ${CLAUDE_SKILL_DIR}/scripts/release.py $ARGUMENTS`
   (patch for fixes, minor for compatible features, major for breaking HTTP changes).
4. Check the diff: only the `version` line of `pyproject.toml` changes.
5. Run the commit and tag commands the script prints, then `git push origin main --follow-tags`.
6. Wait for the tag's CI run to be green. If it fails, keep the tag and tell the release manager.
7. Release notes in the team channel: every merged pull request since the previous tag, grouped
   into Features, Fixes and Internal, breaking changes first and in bold, with the CI link.
8. Tell support about changed HTTP responses; update the service catalogue; close the milestone
   and move its unfinished issues to the next one.
