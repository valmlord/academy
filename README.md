# Academy

A personal learning platform in the spirit of Hexlet. The first course: "AI for developers". All
learning happens in the web interface: theory, a workspace with a terminal and an agent in a Docker
container, checks, mentor review, progress on the dashboard.

Two agent teams build the platform and the course, and the process works like a real product team:
tasks in GitHub Issues, branches, PRs, CI, ADRs. Some platform tasks (`tier:learn`) I write myself,
while the agents design and review.

## Where things are

```
CLAUDE.md                 orchestrator instructions: how any task runs
.claude/pipeline.json     state machine: task tiers, phases, judges (source of truth)
.claude/agents/dev/       dev team: researcher, architect, coder, tester, mentor, 3 judges
.claude/agents/content/   methodologists: content-researcher, curriculum-architect, lesson-author,
                          practice-designer, student, 3 judges
.claude/hooks/            hooks that keep the process from being broken
.claude/feedback/         role mistakes: every judge FAIL appends a lesson, the role reads it before work
pipeline/                 state machine description and shared rules for agents
docs/learning-process.md  how learning works (start here)
docs/architecture.md      platform components
docs/adr/                 architecture decisions
docs/course-reference.md  reference course program
packages/lesson-schema/   lesson contract between the teams + validator
course/                   course content (written by the methodologists)
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
docker compose up -d --wait
```

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
