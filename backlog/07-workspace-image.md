---
title: "build(workspace): образ рабочего места"
labels: [type:chore, team:dev, tier:task, area:infra, area:workspace]
milestone: "M1 Рабочее место"
---
`images/workspace/Dockerfile`: git, node, python, ripgrep, агентский CLI (Claude Code и/или OpenCode), non-root пользователь. Сборка в CI, фиксированные версии.

Критерии приёмки:
- [ ] образ собирается в CI, размер разумный
- [ ] агентский CLI запускается с ключом из env
- [ ] никаких секретов в слоях образа
