# Upstream of this copy

- Repository: https://github.com/mattpocock/skills
- Tag: `v1.3.2` (annotated tag object `85cbec972d7a79c278c793d272f7fc715850fad4`)
- Commit: `d1478fcb140db0b93c0c8df17bcfd311844749d0` (2026-10-29, "chore: version skills (#1161)")
- Fetched: 2026-10-29
- Licence: MIT, `LICENSE` copied unchanged.

Copied unchanged from `skills/engineering/` at that commit:

| Here | Upstream path |
|---|---|
| `grill-with-docs/SKILL.md` | `skills/engineering/grill-with-docs/SKILL.md` |
| `to-spec/SKILL.md` | `skills/engineering/to-spec/SKILL.md` |
| `to-tickets/SKILL.md` | `skills/engineering/to-tickets/SKILL.md` |
| `tdd/SKILL.md` | `skills/engineering/tdd/SKILL.md` |
| `tdd/tests.md`, `tdd/mocking.md` | the two files `tdd/SKILL.md` links to |

Not copied: the `agents/` metadata of each skill, and the `grilling` and `domain-modeling` skills
that `grill-with-docs` calls, so `grill-with-docs` here is reading material, not a working skill.

Reading material for the lesson: these skills are not registered (they are not under `.claude/skills/`),
and no check reads this directory.
