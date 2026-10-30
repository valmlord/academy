---
name: release
description: "Cut a release of invoice-service: bump the version with the bundled script, tag, push, and write release notes. Started only by a human."
disable-model-invocation: true
argument-hint: "major|minor|patch"
---

# Release invoice-service

Only a human starts a release. Not on Fridays, not in the last week of the quarter.
If unsure about any step, stop and ask the release manager.

## Before

1. The working tree is clean, you are on an up-to-date `main`.
2. Run the whole suite (the `verify` skill); never release from a red build.
3. Agree the part with the release manager: patch for fixes, minor for compatible features,
   major for any breaking change of the HTTP API.

## Cut

4. From the repository root run `python3 ${CLAUDE_SKILL_DIR}/scripts/release.py $ARGUMENTS`.
   It rewrites the version line in `pyproject.toml` and prints the commit and tag commands.
5. Check the diff: only the version line in `pyproject.toml` changes.
6. Run the printed commit and tag commands exactly as printed, then `git push origin main --follow-tags`.
7. Wait for the tag's CI to go green. If it fails, do not delete the tag; tell the release manager.

## After

8. Release notes in the team channel: every merged PR since the previous tag, grouped into
   Features, Fixes and Internal, breaking changes first in bold, link to the tag's CI run.
9. Tell support about any change in HTTP responses; update the service catalogue version;
   close the milestone and move unfinished issues to the next one.
10. One hour after the deploy check the error dashboard. If the error rate doubled, roll back by
    redeploying the previous tag from CI (never by reverting commits on main), open an incident
    ticket (what was released, what broke, when rolled back), add it to the notes; the next
    release must include a test for the incident.
