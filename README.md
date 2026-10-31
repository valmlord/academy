# Academy

A personal learning platform in the spirit of Hexlet. The first course: "AI for developers". All
learning happens in the web interface: theory, a workspace with a terminal and an agent in a Docker
container, checks, mentor review, progress on the dashboard.

Three agent teams build the platform, the course and its design, and the process works like a real product team:
tasks in GitHub Issues, branches, PRs, CI, ADRs. Some platform tasks (`tier:learn`) I write myself,
while the agents design and review.

## Where things are

```
docs/learning-process.md  how learning works (start here)
docs/architecture.md      platform components
docs/adr/                 architecture decisions
docs/course-reference.md  reference course program
packages/lesson-schema/   lesson contract between the teams + validator
course/                   course content (written by the methodologists)
design/                   flows, design system and page prototypes (written by the design team, ADR-0006)
scripts/                  design token validator (ADR-0006)
tests/design/             tests of the design token validator
```

## Getting started

Requirements: Node 22, pnpm 10, Docker, git, gh, python3.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm content:validate
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

### Course content

The catalog and lesson pages read `course/` at request time (ADR-0009). The image carries a copy of the
learner-visible files only, in `/app/course`: `course.yaml`, every listed `module.yaml`, and `lesson.yaml`,
`theory.md`, `task.md` of every listed lesson; never `checks/`, `starter/` or `quiz.yaml`. So a content change
shows up in the compose stack only after `docker compose up -d --build`; `pnpm dev` shows it on reload.
`bash apps/web/scripts/check-image-course.sh` checks the image against the current `course/` and prints the
lines `C1 OK` to `C4 OK`.

`COURSE_ROOT` names the directory that holds the course, as an absolute path. Unset, `pnpm dev` reads the
repository's `course/`; the image sets `/app/course`; a relative path puts the course pages into their course
error state and logs `web: course read failed: COURSE_ROOT: must be an absolute path`. The line
`web: course read failed: .: missing` means the course root itself does not exist: `COURSE_ROOT` points
nowhere, or the image was built without `/app/course`.

`ACADEMY_SKIP_ROOT_ENV` is for isolated test runs that must not read the root `.env`. Unset, which is the
normal case, `pnpm dev`, `pnpm build`, `pnpm seed` and `pnpm test:e2e` load the root `.env` exactly as
before. Exported as `1`, they skip it and print `root .env not loaded: ACADEMY_SKIP_ROOT_ENV=1` on stderr;
any other value stops startup with an error naming the variable. `COMPOSE_ENV_FILES=/dev/null` is the
compose counterpart. Export both in the shell, never in `.env`.

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
