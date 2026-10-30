# Academy

A personal learning platform in the spirit of Hexlet. The first course: "AI for developers". All
learning happens in the web interface: theory, a workspace with a terminal and an agent in a Docker
container, checks, mentor review, progress on the dashboard.

Three agent teams build the platform, the course and its design, and the process works like a real product team:
tasks in GitHub Issues, branches, PRs, CI, ADRs. Some platform tasks (`tier:learn`) I write myself,
while the agents design and review.

## Where things are

```
CLAUDE.md                 orchestrator instructions: how any task runs
.claude/pipeline.json     state machine: task tiers, phases, judges (source of truth)
.claude/agents/dev/       dev team: researcher, architect, coder, tester, mentor, 3 judges
.claude/agents/content/   methodologists: content-researcher, curriculum-architect, lesson-author,
                          practice-designer, student, 3 judges
.claude/agents/design/    design team (UX/UI): ux-researcher, product-designer, ui-designer, 3 judges
.claude/hooks/            hooks that keep the process from being broken
.claude/feedback/         role mistakes: every judge FAIL appends a lesson, the role reads it before work
pipeline/                 state machine description and shared rules for agents
docs/learning-process.md  how learning works (start here)
docs/architecture.md      platform components
docs/adr/                 architecture decisions
docs/course-reference.md  reference course program
packages/lesson-schema/   lesson contract between the teams + validator
course/                   course content (written by the methodologists)
design/                   flows, design system and page prototypes (written by the design team, ADR-0006)
learner/                  learner profile and journal (the course adapts to it)
backlog/                  drafts of the first tasks, imported into GitHub Issues
tests/pipeline/           self-test of the pipeline hooks
```

## Getting started

Requirements: Node 22, pnpm 10, Docker, git, gh, python3, a recent Claude Code (the hooks use SubagentStop with `agent_transcript_path`).

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm content:validate && pnpm test:pipeline
cp .env.example .env
docker compose up -d --build --wait
```

## Web app

`apps/web` applies the database migrations at startup and exits if the database is down or a migration
fails, so start the database first. It also exits when `BETTER_AUTH_SECRET` is missing, shorter than 32
characters or Better Auth's public default. Append a generated one to the root `.env` without printing
it: `printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env`. Every compose command that reads
the file needs it, including `docker compose up -d --wait db`, and so does `pnpm dev`.

```bash
docker compose up -d --wait db   # the database alone
pnpm dev                         # http://localhost:3000, reads DATABASE_URL from the root .env
docker compose up -d --build --wait   # the whole stack, web on http://127.0.0.1:3080 (WEB_PORT)
```

Always pass `--build` after a change: compose tags the image `academy-web:local`, and `up` without
`--build` reuses a stale one.

### Signing in

The platform has one user, created by a seed script; there is no sign-up. From the repository root:

1. `ls .env`; if it is missing, `cp .env.example .env`.
2. Append the secret as above; `grep -c '^BETTER_AUTH_SECRET=' .env` prints `1`.
3. Open `.env` in an editor and add `SEED_EMAIL=...` and `SEED_PASSWORD=...` (8 to 128 characters). The
   file is git-ignored. Never type the password on a command line, where the shell history keeps it.
4. `docker compose up -d --build --wait` (web applies the migrations, including the auth tables).
5. `pnpm seed` prints `seed: created` (it builds `@academy/db` and `@academy/lesson-schema` first). To
   keep the password out of `.env`, in zsh: `read -rs "SEED_PASSWORD?Seed password: " && export
   SEED_PASSWORD && SEED_EMAIL=you@example.com pnpm seed; unset SEED_PASSWORD`.
6. Open http://127.0.0.1:3080 and sign in with those values.

To change the password, change `SEED_PASSWORD` in `.env` and run `pnpm seed` again: it prints
`seed: updated` and ends every existing session. The seed refuses to create a second user.

End-to-end tests sign in with the same `SEED_EMAIL` / `SEED_PASSWORD` and run against the compose stack.
A Playwright trace of a failed local run can hold the typed password; `test-results/` is git-ignored,
delete it when you share a machine.

```bash
pnpm --filter @academy/web exec playwright install chromium --only-shell   # once
pnpm test:e2e                    # E2E_BASE_URL overrides http://127.0.0.1:3080
```

`apps/web/app/globals.css` carries `design/system/tokens.css` verbatim between the `design-tokens`
markers, and `pnpm test` fails when they differ. When a DESIGN PR changes `tokens.css`, its CI goes red;
the orchestrator opens a dev HOTFIX issue "re-copy the token block" whose branch is cut from the DESIGN
branch and whose PR targets it (`gh pr create --base <design-branch>`). The coder copies the file between
the markers and nothing else. GitHub does not close an issue from a PR into a non-default branch, so that
issue is closed by hand after the DESIGN PR merges. A re-copy that changes more than 5 lines runs as
TASK, not HOTFIX.

## Connecting GitHub

```bash
gh repo create academy --private --source . --push
python3 scripts/github_bootstrap.py --dry-run   # show the plan
python3 scripts/github_bootstrap.py             # labels, milestones and 20 issues from backlog/
```
The script also replaces `@OWNER` in `.github/CODEOWNERS` with your login. Commit that change
through a branch and a PR, like any other.

## Running a task

Open Claude Code in the repository and write, for example, "take #1". The orchestrator reads the
issue, picks the tier, announces `[PROJECT #1] pipeline: ...`, creates a branch and drives the task
through the phases up to the PR. Details in `CLAUDE.md`.

Suggested order: #1 (web skeleton) and the module "Introduction to AI-assisted development" in
parallel, then M0, then the LEARN tasks of M1.
