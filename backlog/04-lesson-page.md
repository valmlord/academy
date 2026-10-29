---
title: "feat(web): course catalog and lesson page from course/"
labels: [type:feature, team:dev, tier:task, area:web, area:content]
milestone: "M0 Foundation"
---
Web reads the course through `@academy/lesson-schema` (no lesson types of its own). A catalog of modules and lessons with status `ready`; the lesson page: theory and the task on the left (markdown), a workspace stub on the right for now.

Acceptance criteria:
- [ ] lessons not in status `ready` are not visible
- [ ] the contents of `checks/` are never sent to the browser (with a test for it)
- [ ] e2e: open a module, open a lesson, see the theory
