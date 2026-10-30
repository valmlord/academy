# Issue #50 research: learner flows, design system v1 and core page prototypes

ux-researcher, DESIGN tier, `researcher` phase, branch `docs/50-learner-flows-design-system`, HEAD
`8d47a4a`. Facts only, each with its source; the architect (ux-researcher in `architect`) designs the
flows and the IA from them. Checked 2026-10-29.

## 1. Learner goals, with sources

| # | Goal | Source |
|---|------|--------|
| G1 | Go from "what do I study next" to "lesson passed" without leaving the platform | issue #50 "Learner goal" |
| G2 | Read theory, do the task in the browser workspace, run the checks, see progress | issue #50; `docs/learning-process.md` §1-2 |
| G3 | Close the browser and come back later to the same files | `docs/learning-process.md` §1 ("Files are kept in a volume"); ADR-0002 |
| G4 | Get Socratic help on request, in levels, never a ready solution | `docs/learning-process.md` §3; `learner/profile.md` "Format" |
| G5 | See progress by module, attempt history, mentor remarks, weak topics, attempt cost | `docs/learning-process.md` §2 (cost "shown on the dashboard"), §4; #35 |
| G6 | Understand what the agent does and be able to check its work | `learner/profile.md` "Goal" |
| G7 | Not freeze on "build the whole thing": know where to start | `learner/profile.md` "Known weak spots" |

- Fact: `learner/journal.md` has no entries yet (only the format). No observed gap can source a flow;
  flows source from the course files, the process doc, the profile and the issues.
- Fact: the learner is a senior fullstack developer (7.5 years, Docker, Kubernetes, TypeScript;
  `learner/profile.md`), with "little experience with Linux, networking and systems programming".
  Implication: the UI need not explain git or an editor, but terminal and container errors must be
  stated plainly (what broke, what to do), not as raw Docker output only.
- Fact: weekly rhythm (`docs/learning-process.md` §6): open the next lesson from the dashboard, read
  theory, practice, submit, mentor review, retry. Implication: "next lesson" is the dashboard's
  primary action (G1, G7).

## 2. Vocabulary (one term per concept)

Taken from `course/`, the schema and `docs/learning-process.md`. UI copy is Russian.

| Concept | English (docs, ids) | Russian (UI) | Source |
|---------|---------------------|--------------|--------|
| course | course | курс | `course.yaml` title "ИИ для разработчиков" |
| module | module | модуль | `module.yaml`; ADR-0001 |
| lesson | lesson | урок | `lesson.yaml`; task files ("Сброс урока") |
| theory | theory | теория | `theory.md`; learning-process §1 |
| task | task | задание | every `task.md` starts "# Задание: ..." |
| workspace files | working folder | рабочая папка | 28 uses in `course/**/task.md` ("Что в рабочей папке") |
| check | check | проверка | task.md "проверка закрывается", "Как проверяется" |
| attempt | attempt | попытка | task.md "Попытки и подсказки" |
| quiz | quiz | квиз | task.md "Квиз: не больше 3 попыток" |
| mentor | mentor | ментор | learning-process §3 |
| hint, levels | hint | подсказка; "скелет", "скажи прямо" | learning-process §3; profile |
| passed / not passed | passed / failed | "пройдено" / "не пройдено" | task.md (quoted literally) |
| outcomes | outcomes | (no Russian term in course; architect picks one) | schema `outcomes` |

- Fact: no Russian word for "workspace" appears in `course/` ("рабочая папка" is the files, not the
  container; "окружение" appears 8 times in prose). The architect must pick one UI term for the
  workspace panel and its lifecycle and use it everywhere.
- Fact: learning-process §1 names the workspace tabs Terminal, Editor, Agent; §2 names the "Check"
  button. No Russian labels are fixed yet.

## 3. What the UI must show: data from the lesson contract

Source: `packages/lesson-schema/src/schema.ts`, ADR-0001.

- Course: `id, title, description, modules[]`.
- Module: `id, title, summary, outcomes[], status, lessons[]`.
- Lesson: `id, title, type (theory | quiz | artifact | agent-eval | bug-hunt | project), outcomes[],
  estimatedMinutes (<= 600), status, prerequisites[] (lesson ids), sources[] {title, url, checkedAt},
  workspace? {image, starter}, checks[]`.
- Check (common): `id, title, weight`. Per kind: `quiz {file, passScore}`, `command {run, timeoutSec
  <= 1800}`, `rubric {rubric, artifacts[], passScore}`, `hidden-task {task, verify, timeoutSec <= 3600,
  budgetUsd <= 20}`, `bug-hunt {answers, minFound}`.
- Fact: the learner sees only `ready` lessons (ADR-0001 item 4; #30 AC "lessons not in status `ready`
  are not visible"). Today module 00 is `ready` with 6 ready lessons; modules 01-05 are `planned` with
  no lessons (`course/ai-for-developers/*/module.yaml`). Implication: the catalog has one module with
  content and five without; the empty and "planned" states are the common case, not an edge case.
- Fact: `checks/` content, `answers`, `rubric`, `task`, `verify` paths never reach the browser (ADR-0001
  item 5; #30 AC). The UI may show a check's `title`, `kind`, `weight`, `timeoutSec`, `budgetUsd`, but
  never the grader files. `run` is a command string that points into `$ACADEMY_CHECKS_DIR`; showing it
  is a dev decision, not a design one (open question 7).
- Fact: module 00 lessons: estimatedMinutes 40, 60, 45, 70, 50, 80; checks per lesson 2-3; every lesson
  has a `workspace`; kinds used: `command` (all), `quiz` (5 of 6), `rubric` (L4, L5), `bug-hunt` (L4).
  Command `timeoutSec` 30-120. No `hidden-task` in module 00.
- Fact: `prerequisites` exist (e.g. L2 needs `intro-models-effort`; L6 needs L2 and L5). Nothing in the
  repo says whether an unmet prerequisite locks a lesson or only warns. Open question 3.
- Fact: theory.md structure (module 00): an H1 title, H2 sections "Проблема", "Идея: ...", ..., "Частые
  ошибки", "Что делать в практике"; H3 subsections; 0-4 fenced code blocks; 0-12 table rows; 107-163
  lines. task.md: 64-241 lines, sections "Что в рабочей папке", "Что сделать", "Что значит "готово"",
  "Как проверяется", "Попытки и подсказки". Implication: the left pane is long-form markdown with
  tables and code; it needs an in-page outline or tabs between theory and task, and readable line length.
- Fact: quiz.yaml: `version`, `questions[] {id, type: single | multiple, prompt, options[] {id, text},
  correct[], explanation}` (module 00: 20 single, 10 multiple). `correct` and `explanation` must not
  reach the browser before submission (#36).
- Fact: bug-hunt submission is a file in the working folder (`findings.json`), not a form
  (`04-context-and-planning/task.md`). The UI only runs the check and shows its result.

## 4. Behaviour promised to the learner by the course text

The lesson authors already wrote UI behaviour into `task.md` ("Попытки и подсказки", "Как
проверяется"). These are requirements for the check panel, quiz and mentor flows:

- Quiz: at most 3 attempts; after a failed attempt only the total score is shown; answers and
  explanations open after passing or after the 3rd failure, and then the quiz is closed as "не
  пройдено" with a mentor review (L1, L2, L3, L5, L6 task.md).
- Command checks: either unlimited attempts with "after 5 failed the interface offers the mentor" (L2,
  L5, L6), or at most 10 failed checks, after which the check is closed as "не пройдено" (L1
  `model-routing`, L3 `cost-estimate`).
- Bug-hunt: at most 3 graded submissions; on failure only "не пройдено", no count of found bugs (L4).
- A run that fails on a format error does not count as an attempt; format errors name the index and
  field, e.g. `findings[2].line: expected integer` (L1, L3, L4).
- "Сброс урока или рабочей папки счётчик не обнуляет" (L1, L3): there is a lesson reset and a working
  folder reset, and resetting does not reset attempt counters.
- Mentor hint levels "скелет" and "скажи прямо" unlock only after the check is closed (all six lessons).
- Failure messages: L2 names the failed item; L1 names only how many cards are wrong; L4 says only "не
  пройдено". Implication: the check result component shows the grader's message verbatim and must not
  add detail of its own (no per-test breakdown the grader did not give).
- Fact: none of these limits are fields in `lesson.yaml` (the schema has no attempt limit). Where the
  limits live is a dev/contract question (open question 1); the design must show counters
  ("попытка 2 из 3"), the closed state and the mentor offer whatever the source.

## 5. Constraints from the dev backlog (#1, #28-#40)

| Issue | Milestone | What the page needs | Tier |
|-------|-----------|---------------------|------|
| #1 web scaffold | M0 | home page with a list of courses (stub); Playwright smoke | PROJECT, parked, resumes after #50 |
| #28 DB schema | M0 | data for the UI: users, enrollments, lesson_progress, attempts (lesson id, status, check results, transcript link), check_results, mentor_reviews | TASK |
| #29 sign-in + dashboard | M0 | email and password (Better Auth); protected routes; redirect to sign-in; sign-out; dashboard "with courses and progress (empty for now)"; seed creates the local user | TASK |
| #30 catalog + lesson page | M0 | catalog of modules and lessons, `ready` only; lesson page: theory and task on the left (markdown), workspace stub on the right; e2e open module -> lesson -> theory | TASK |
| #31 workspace service | M1 | create (idempotent), start, stop, delete; GC of abandoned containers; recovery after restart | LEARN |
| #32 terminal | M1 | "Terminal" tab, xterm.js over WebSocket, `docker exec` TTY, resize, reconnect to the same session on network drop; bash and agent CLI | LEARN |
| #33 workspace image | M1 | none directly; agent CLI needs an API key from env (missing-key state) | TASK |
| #34 check runner | M1 | "Check" button; results streamed (SSE, `docs/architecture.md`); timeout marked as timeout; concurrent checks do not collide; saved as an attempt | LEARN |
| #35 progress | M2 | attempt history per lesson, lesson and module status, course percentage, weak topics | TASK |
| #36 quiz | M2 | render quiz.yaml, server scoring, explanations after submission | TASK |
| #37 mentor review | M2 | rubric grading, Socratic answer, a score; budget per call, cost logging | PROJECT |
| #38 transcripts | M2 | transcript attached to the attempt (the mentor reads it); no UI named | TASK |
| #39 hidden-task | M2 | headless agent on a hidden task, timeout and budget from `lesson.yaml` (up to 3600 s, $20) | LEARN |
| #40 editor | M4 | "Editor" tab: code-server in an iframe behind an authorized proxy | TASK |

- Auth model (#29, ADR-0003): single local user, email and password, no sign-up page in scope (the seed
  creates the user; issue #50 excludes multi-user and admin). Better Auth session: expires after 7 days
  by default, extended to now + 7 days when used after `updateAge` (1 day) (Better Auth docs,
  github.com/better-auth/better-auth docs/content/docs/concepts/session-management.mdx, via Context7
  `/better-auth/better-auth`). Implication: session expiry is rare but must have a state: an API call
  or WebSocket rejected mid-lesson returns to sign-in and then back to the same lesson.
- WCAG 2.2 SC 3.3.8 Accessible Authentication (Minimum) applies to the sign-in page: password managers
  and paste must work (`plans/27-design-team-research.md` §7, W3C source there).
- Transports (`docs/architecture.md`): WebSocket for the terminal, SSE for the check stream. Both can
  drop independently; reconnect is an AC only for the terminal (#32).
- Fact: no workspace TTL, idle timeout or GC age is defined anywhere (`grep -ri "ttl|idle"` over
  `docs/`, `backlog/`, ADR-0002: no hits; #31 says only "a garbage collector for abandoned
  containers"). ADR-0002: files live in a named volume and survive a restart. Implication: the design
  must not invent a number; it names the states (stopped by GC, starting again, files kept) and leaves
  the value to #31 (open question 2). Lesson durations are 40-80 min, so any idle limit shorter than a
  lesson needs a warning.
- Check durations: command checks 30-120 s in module 00 (schema max 1800 s); hidden-task up to 3600 s.
  Implication: the check panel needs a running state with elapsed time against the timeout, and a long
  run must not block reading theory or using the terminal.
- Agent checks cost money: `budgetUsd` per hidden-task; "the cost of an attempt is shown on the
  dashboard" (learning-process §2); #37 "budget per call, cost logging".
- Workspace prerequisites the UI can fail on: Docker not running (ADR-0002 "Docker Desktop is required"),
  image missing (#33), API key missing in `.env` (learning-process §1, #33), container limits hit
  (CPU, memory, pids, ADR-0002).
- Security constraints visible in UI: someone else's workspace id is rejected (#32); the learner cannot
  read `checks/` (#34). No design work, but "rejected" needs an error state.
- Desktop first, usable on a laptop (issue #50). ADR-0006 still asks acceptance notes for 375, 768, 1280.
  A terminal plus markdown split at 375 px is not usable; the architect states what the workspace page
  does below a breakpoint (open question 6).

## 6. What exists in `design/`

- Only `design/README.md`: layout, how to open prototypes, an empty page table. No `flows/`, no
  `system/`, no `pages/`. Flow ids start at F1; the registry in `ia.md` is new.
- `scripts/design_tokens.py` (610 lines) enforces ADR-0006 once `design/system/tokens.css` exists:
  required colour tokens `background, foreground, card(-foreground), popover(-foreground),
  primary(-foreground), secondary(-foreground), muted(-foreground), accent(-foreground), destructive,
  border, input, ring` (:35-39); every `<x>-foreground` checked against `<x>` at 4.5:1, plus
  `muted-foreground` and `destructive` on `background` at 4.5:1 (:44), `ring`/`input` on `background`
  and `sidebar-ring` on `sidebar` at 3:1 (:43), `border` on `background` reported only (:45). Flow ids
  unique across `design/flows/*.md`; every `data-step` must be declared.
- Implication for new tokens: any added `<name>-foreground` pair (e.g. `success`, `warning`) is
  contrast-checked automatically; `chart-*` and `sidebar-*` are optional for the validator but present
  in shadcn's default set.

## 7. shadcn/ui facts (current docs)

Source: Context7 `/websites/ui_shadcn` (ui.shadcn.com/docs/theming, /docs/installation/manual,
/docs/components/radix/sidebar, /docs/components/radix/resizable), fetched 2026-10-29.

- Theme scaffold: `@custom-variant dark (&:is(.dark *));`, `@theme inline` mapping
  `--color-<token>: var(--<token>)`, `:root` light and `.dark` dark values in `oklch()`.
  Default token set: `background, foreground, card, card-foreground, popover, popover-foreground,
  primary, primary-foreground, secondary, secondary-foreground, muted, muted-foreground, accent,
  accent-foreground, destructive, border, input, ring, chart-1..5, sidebar, sidebar-foreground,
  sidebar-primary, sidebar-primary-foreground, sidebar-accent, sidebar-accent-foreground,
  sidebar-border, sidebar-ring`; `--radius: 0.625rem` with `--radius-sm..4xl` as
  `calc(var(--radius) * 0.6 .. 2.6)` (theming page).
- The default neutral theme has no `destructive-foreground` (theming page); the manual-install page
  still maps `--color-destructive-foreground`. The two pages disagree; the validator does not require
  it. The ui-designer decides and records it.
- Dark defaults use translucent borders: `--border: oklch(1 0 0 / 10%)`, `--input: oklch(1 0 0 / 15%)`.
  The validator composites translucent colours (`design_tokens.py pair`). Light `--border oklch(0.922 0
  0)` and `--ring oklch(0.708 0 0)` on white are candidates to fail 3:1 (`plans/27-...-research.md` §7);
  the validator measures them.
- Sidebar: `SidebarProvider`, `Sidebar collapsible="icon"`; width constants `SIDEBAR_WIDTH = "16rem"`,
  `SIDEBAR_WIDTH_MOBILE = "18rem"`; toggle shortcut Cmd+B (Mac) / Ctrl+B (Windows)
  (`SIDEBAR_KEYBOARD_SHORTCUT = "b"`) (sidebar docs).
- Resizable: built on react-resizable-panels, "support for mouse, touch and keyboard"; nested
  horizontal/vertical `ResizablePanelGroup` (resizable docs, changelog 2023-12).
- Blocks (ui.shadcn.com/blocks, fetched): `dashboard-01` "A dashboard with sidebar, charts and data
  table" (inset sidebar, section cards, an interactive area chart, a data table, site header);
  `sidebar-07` "A sidebar that collapses to icons"; `sidebar-16` "A sidebar with a sticky site header";
  login blocks `login-01` ("A simple login form", deps button, card, input, label; registry examples
  page), `login-03` (muted background), `login-04` (form plus image). Since February 2026 every block
  exists in Radix and Base UI variants (changelog 2026-02-blocks). Implication: the dashboard and the
  app shell can start from `dashboard-01`/`sidebar-07`, sign-in from `login-01`/`login-03`, so dev has
  a matching shadcn starting point.

## 8. Keyboard and focus facts for the workspace

- Claude Code inside the terminal uses Esc (interrupt), Esc Esc (rewind / clear), Tab, Shift+Tab (cycle
  permission modes), Ctrl+B (background tasks), Ctrl+O, Ctrl+R, Ctrl+T, Ctrl+G, Ctrl+C, Ctrl+D
  (code.claude.com/docs/en/interactive-mode, fetched 2026-10-29). Lesson L4 theory teaches Esc to stop
  the agent. Implication: Esc, Tab and Ctrl+B cannot be the "leave the terminal" key; the terminal must
  receive them.
- Default keybindings (code.claude.com/docs/en/keybindings, fetched 2026-10-29, architect fix round 1):
  Ctrl+X is a chord prefix ("Claude Code binds these default chords on the `ctrl+x` prefix": Ctrl+X
  Ctrl+K, Ctrl+X Ctrl+E, Ctrl+X Enter, Ctrl+X Ctrl+A, Ctrl+X Ctrl+S, Ctrl+X Tab, Ctrl+X Ctrl+B and others);
  Meta+P, Meta+O, Meta+T; Ctrl+L, Ctrl+S, Ctrl+J, Ctrl+V, Ctrl+\_ and Ctrl+Shift+- (undo); reserved:
  Ctrl+C, Ctrl+D, Ctrl+M (Enter), Ctrl+[ (Escape), Ctrl+I (Tab), Ctrl+H. No function key and no other
  Ctrl+Shift+punctuation key is bound. Implication: Ctrl+Shift+. / Ctrl+Shift+, are free for a fallback
  region key next to `F6`; browser delivery is still to be verified (#32 acceptance test).
- Conflict: shadcn's sidebar toggle is Ctrl+B on Windows/Linux, the same key Claude Code uses for
  background tasks (sources above). Whether the sidebar's window listener fires while xterm has focus is
  not verified; the architect either avoids a collapsible sidebar on the workspace page or names the
  conflict for dev.
- Codecademy: code editors grab focus; "You can 'escape' them by pressing Escape or Control+M"; F1 or
  Cmd/Ctrl+Shift+P lists shortcuts; panes are ARIA regions with hidden headings, 2-5 per page
  (codecademy.com/articles/accessibility-on-the-platform). Ctrl+M is Enter (CR) in a terminal, Escape
  is taken (above), so this pattern does not transfer.
- VS Code: Ctrl+M toggles "Tab moves focus" with a status bar indicator; F6 / Shift+F6 move focus
  between workbench parts, recommended also for webviews (code.visualstudio.com/docs/configure/
  accessibility/accessibility). Implication: F6 / Shift+F6 to move between left pane, workspace tabs
  and check panel is a precedent that does not collide with the agent's keys; code-server (#40) inside
  an iframe keeps its own F6 handling (not verified).
- xterm.js has a `screenReaderMode` option ("expose supporting elements in the DOM to support NVDA on
  Windows and VoiceOver on macOS"); no option for leaving focus (xtermjs.org ITerminalOptions).

## 9. Prior art: browser learning workspaces

Every claim has its source; fetched 2026-10-29.

- Exercism online editor: code editor on the left, instructions on the right; "Run Tests" shows the
  results on the right after the run; "Once your solution passes all the tests, you can submit your
  solution using the "Submit" button"
  (exercism.org/docs/using/solving-exercises/using-the-online-editor). Takeaway: instructions and
  results share one pane; submit is gated on green.
- Codecademy: the first pane is always the narration pane; checkpoint results appear there, "If your
  code is considered correct, the checkpoint will be marked as complete. If it's not correct, an error
  will appear explaining what went wrong"; some layouts have no Run button and use "Check Work"
  (curriculum-documentation.codecademy.com/exercises/le-layouts/code-editor-layout/ and
  /exercises/exercise-standards/, via search summary). Takeaway: check results live next to the task
  text, matching learning-process §1 ("check results and the mentor review after submission" on the
  left).
- GitHub Codespaces: default idle timeout 30 min, configurable 5-240 min, 12-hour maximum lifetime;
  on timeout "your data is preserved from the last time your changes were saved"; stopped codespaces are
  deleted after 30 days by default; rebuild keeps `/workspaces` only
  (docs.github.com/en/codespaces/setting-your-user-preferences/setting-your-timeout-period-for-github-codespaces;
  docs.github.com/en/codespaces/about-codespaces/understanding-the-codespace-lifecycle). Neither page
  mentions a warning before timeout. Takeaway: separate "stopped, files kept" from "deleted"; say which
  paths survive a reset.
- Instruqt: a required track time limit (example 3600 s), an optional idle timeout (example 300 s);
  owners can let learners extend: "a prompt will appear when a track reaches its limit" (example
  extension 600 s) (docs.instruqt.com/tracks/manage/time-limits-and-idle-timeouts). Pausable tracks:
  idle timeout pauses instead of stopping; pause lasts 1-60 days (default 7); resume takes about 1-3
  minutes and continues from the last challenge; an expired pause means start over
  (docs.instruqt.com/tracks/manage/pausable-tracks). Takeaway: resume is a minutes-long state that needs
  its own progress screen.
- Killercoda: PLUS lets you "Use scenarios for up to 4 hours instead of just one"; no warning before
  expiry is documented (killercoda.com/pricing). Takeaway: a hard session cap is common in hosted labs;
  local Docker (ADR-0002) does not need one, which argues against inventing a countdown.
- Not verified: Codecademy "Get Unstuck" behaviour (help page returned 403); Killercoda free-tier
  limit (only implied as one hour by the pricing page).

## 10. Scope pressure

Cost units are relative prototype effort for the product-designer (prototype plus acceptance notes),
S = 1, M = 2, L = 4, XL = 6, counting states, steps and acceptance checks the issue implies. The design
system is separate (ui-designer).

| Page or deliverable | In #50 as | Consuming dev issue(s) | Needed by milestone | States implied | Cost |
|---------------------|-----------|------------------------|---------------------|----------------|------|
| Flows + IA (all journeys) | flows | all | M0 | per flow: entry, success, error, empty, exit | L (ux-researcher, architect phase) |
| Design system v1: tokens light/dark, scales, inventory, `components.html` | system | #1, every web page | M0 (#1 resumes after #50) | both themes; status colours (pass, fail, timeout, running) beyond shadcn's `destructive` | L |
| Sign-in | flow only in the prototype list | #29 | M0 | default, invalid credentials, submitting, session expired (returns to lesson) | S |
| Dashboard | prototype | #29 (empty), #35 (full) | M0 empty, M2 full | first run (no progress), in progress, next lesson, attempt history, weak topics, attempt cost, all done, load error | L |
| Course catalog | prototype | #30 (#1 home stub) | M0 | module with ready lessons, planned modules without lessons, lesson status per lesson, prerequisites unmet | M |
| Module page | flow ("module and lesson pages") | #30 | M0 | summary, outcomes, lesson list; may merge into catalog (open question 4) | S |
| Lesson page: theory + task, workspace stub | prototype | #30 | M0 | theory/task switch, long markdown with tables and code, outcomes, estimated time, sources, check list, stub workspace | M |
| Lesson workspace shell: tabs, lifecycle | prototype | #31, #32, #40 | M1 (#40 M4) | creating, starting, running, stopped (GC), Docker down, image missing, API key missing, terminal reconnecting, session rejected, reset confirm, Editor tab not available yet | XL |
| Check panel inside the lesson page | part of workspace shell | #34 (#39 later) | M1 | idle, queued, running with elapsed/timeout, per check passed / not passed / timeout / format error (not counted), attempt counter, closed "не пройдено", mentor offer after 5 | L |
| Quiz | flow only | #36 | M2 | question list, submit, score only on fail, attempt n of 3, reveal after pass or 3rd fail, closed | (M if prototyped later) |
| Mentor review | flow only | #37 (#38) | M2 | review after checks, hint ladder 4 levels, levels locked until the check is closed, budget exhausted | (L if prototyped later) |
| Progress | flow only | #35 | M2 | on the dashboard per learning-process §4, or a separate page (open question 5) | (M if separate) |

- Total in the issue's prototype list: dashboard L + catalog M + lesson page M + workspace shell XL +
  check panel L = about 15 units, plus the system L and flows L. #26 and #27 show a judge round per
  phase; every extra prototype multiplies `judge_ux` review surface.
- Order by need: #1 resumes right after #50 and needs only the system; #29 and #30 (M0) need sign-in,
  dashboard empty state, catalog and lesson page; the workspace shell feeds LEARN tasks #31, #32, #34
  (M1) where Stepan writes the code himself, so their UI can follow later without blocking M0.
  Implication: one split that fits one PR is system + flows/IA + sign-in + dashboard (empty and full)
  + catalog + lesson page with a stub workspace; workspace shell and check panel as a second DESIGN
  issue. The architect decides.
- Sign-in is needed by #29 but is not in the issue's prototype list (only in the flows list). It is
  the cheapest page (S) and #29 is M0; the architect decides whether to add it.
- Lesson page and workspace shell are one route (learning-process §1: theory/task left, workspace
  right). Splitting them across two PRs means the second PR revises the first page's prototype; its
  acceptance notes need a stated stub area so the later shell slots in.

## 11. Open questions for the architect (and Stepan where marked)

1. Attempt limits and "offer the mentor after 5" exist only in `task.md` prose, not in `lesson.yaml`.
   Is that a contract gap for dev (ADR-0001 change, Stepan) or does the UI read nothing and the server
   decides? The design shows counters either way.
2. Workspace idle stop / GC age: not defined (#31). Design states without a number, or ask Stepan for one?
3. Do unmet `prerequisites` lock a lesson or only warn? Nothing in the repo decides it.
4. Is the module page a separate route or a section of the catalog (one course, six modules)?
5. Progress: a section of the dashboard (learning-process §4) or its own page (issue lists "progress"
   separately)?
6. Below 768 px: does the lesson page show theory only with a "open on a laptop" note for the
   workspace, given "desktop first" and ADR-0006's 375 px breakpoint?
7. May the check list show the `run` command string (it names `$ACADEMY_CHECKS_DIR`, not its content)?
8. Agent tab (learning-process §1, "later a separate panel with the transcript", #38): out of #50, or a
   disabled tab in the shell?
9. Where does the mentor review appear: left pane under the check results (learning-process §1) or a
   panel in the workspace? Flow only in #50, but the lesson page layout must leave room.
10. Course percentage (#35): by lessons passed, or by check `weight`? Weight exists in the schema; no
    source says how it aggregates.
11. Sidebar Ctrl+B vs Claude Code Ctrl+B in the terminal (section 8): no collapsible sidebar on the
    lesson page, or a note to dev?
