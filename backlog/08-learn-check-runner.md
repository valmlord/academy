---
title: "learn(workspace): run lesson checks and stream the results"
labels: [type:feature, team:dev, tier:learn, area:workspace]
milestone: "M1 Workspace"
---
I write this myself. A "Check" button: the workspace service runs the lesson's `command` checks in the container, `checks/` is mounted only for the duration of the check and only for the grader, the results are streamed to the UI and saved as an attempt.

Acceptance criteria:
- [ ] a check that hits its timeout is killed and marked as timeout
- [ ] two concurrent checks of the same workspace do not break each other
- [ ] the learner cannot read `checks/` from their terminal
