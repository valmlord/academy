---
title: "build(workspace): workspace image"
labels: [type:chore, team:dev, tier:task, area:infra, area:workspace]
milestone: "M1 Workspace"
---
`images/workspace/Dockerfile`: git, node, python, ripgrep, an agent CLI (Claude Code and/or OpenCode), a non-root user. Built in CI, pinned versions.

Acceptance criteria:
- [ ] the image builds in CI, its size is reasonable
- [ ] the agent CLI starts with a key from env
- [ ] no secrets in the image layers
