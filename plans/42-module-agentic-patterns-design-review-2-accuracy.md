# #42 judge_design round 2: accuracy

Reviewed: `plans/42-module-agentic-patterns-design.md` revision 2 (sections 0-14, with L4 G1-G7, N1-N4 and V1-V14),
against my round-1 report and the primary pages, all fetched again on 2026-10-30. I didn't use the design's quotes as
evidence; each V-quote was compared with the live page.

PASS. All 8 round-1 blocking items are resolved, and each resolution matches the vendor page. Every graded L4 rule
rests on documented behaviour. No form the brief allows is failed: I checked every "Accepted forms" cell against the
documented forms, and checked that no documented alternative is missing. The non-blocking items below are wording
fixes for the lesson-author and the researcher. judge_content must check them in the lesson text.

## Round-1 blocking items: status

1. WEB_FETCH is on/off. Resolved (G6).
   - env-vars.md: "set `1`, `true`, `yes`, or `on` to turn it on and `0`, `false`, `no`, or `off` to turn it off, in
     any casing".
   - `CLAUDE_CODE_DISABLE_WEB_FETCH` is not in the presence-only list (NONESSENTIAL_TRAFFIC, DISABLE_TELEMETRY,
     DISABLE_ERROR_REPORTING, TMUX_TRUECOLOR, IS_DEMO).
   - Row: "Set to `1` to turn off the WebFetch tool. The WebSearch tool stays available. Requires Claude Code v2.1.285
     or later".
   - G6 accepts on-values in any case and fails off-values and other values with honest reasons. Matches.
2. Deny forms are enumerated. Resolved (G6). permissions.md:
   - "`Bash(*)` is equivalent to `Bash` ... As a deny rule, both forms remove the tool". This is stated for Bash only,
     so the honest message for `WebSearch(*)` is correct.
   - "Deny and ask rules also accept glob patterns in the tool-name position. The pattern must match the full tool
     name: `"*"` matches every tool ... A tool matched by a bare-name glob deny rule is removed from Claude's context".
   - Table: `WebFetch(domain:*)` deny: "Claude Code keeps the tool and refuses each fetch, and sandboxed commands can't
     reach any host".
   - No other documented WebSearch switch exists: no env variable (only `..._MAX_WEB_SEARCHES_PER_SESSION` and
     `..._WEB_SEARCH_REFILLS_PER_HOUR`) and no settings key in the index.
3. strictAllowlist and the allowlist scope. Resolved (G7).
   - sandboxing.md: strictAllowlist works "in user, managed, or CLI `--settings` settings". "Setting it in a
     repository's `.claude/settings.json` or `.claude/settings.local.json` has no effect. Requires Claude Code v2.1.219".
   - Locks table (v2.1.285+): `network.strictAllowlist` in "Managed settings, `--settings`, user settings" makes Claude
     Code ignore "The proxy ports, `allowedDomains`, and `WebFetch(domain:...)` allow rules" in a repository's settings.
     So "repository entries pass whatever they hold" and "the mirror must be in user settings" are correct at 2.1.314.
   - settings-reference `allowedDomains`: "Wildcards such as `*.example.com` match subdomains, and an optional `:port`
     suffix limits an entry to one port".
   - permissions.md: only the `domain:` form feeds the sandbox list, and a bare `WebFetch` allow "Doesn't change which
     hosts sandboxed commands can reach". So the starter's project `allow: ["WebFetch"]` is correctly not graded by G7.
4. Per-tool CA trust. Resolved (G5, N1).
   - uv env reference: `SSL_CERT_FILE` "overrides the default certificate source ... Only the certificates in this
     file will be trusted". `SSL_CERT_DIR` (0.9.10) is "a directory containing PEM-encoded CA certificate files".
     `UV_SYSTEM_CERTS` loads "the platform's native certificate store".
   - network-config: `NODE_EXTRA_CA_CERTS` is introduced with "configure Claude Code to trust it directly".
   - Git was dropped from the brief.
5. `UV_INDEX_URL` is accepted. Resolved (G4). uv: "(Deprecated: use `UV_DEFAULT_INDEX` instead.)". `UV_INDEX` is
   "additional indexes", so failing it alone is correct.
6. Placement of variables in settings `env`. Resolved (G1-G3, N1, effective-value model).
   - env-vars.md: "the settings file value applies in most sessions. Claude Code writes each `env` entry into the
     process environment, replacing the value inherited from the shell".
   - settings-reference `env`: "when more than one settings file sets a variable, the highest-precedence one applies".
   - settings.md: "managed settings, command line, project local, shared project, user", and "An `env` block inside a
     settings file is an ordinary key and follows the levels above".
   - I checked the full "Variables Claude Code ignores in `env`" list. None of `ANTHROPIC_BASE_URL`,
     `ANTHROPIC_AUTH_TOKEN`, `NODE_EXTRA_CA_CERTS`, `CLAUDE_CODE_USE_*`, `..._DISABLE_NONESSENTIAL_TRAFFIC` or
     `..._DISABLE_WEB_FETCH` is on it. So "any of the four places" is never a no-op placement.
7. Five providers. Resolved (N2). env-vars rows: `CLAUDE_CODE_USE_ANTHROPIC_AWS`, `_BEDROCK`, `_FOUNDRY`, `_MANTLE`,
   `_VERTEX`. `_POWERSHELL_TOOL` is not a provider. Empty means unset for provider selection: "Claude Code treats the
   empty value as unset for provider selection".
8. `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT`. Resolved in the design (V14 matches the row and the 2.1.312 changelog line
   verbatim). The R C1 correction is still pending (12.6 a): see non-blocking item 7.

## New L4 rules: checked, no blocking issue

- G1: the base URL has no `/v1`. Verified by the curl to `"$ANTHROPIC_BASE_URL/v1/messages"` (llm-gateway-connect).
- G2:
  - The warning "Don't put the credential in a project's `.claude/settings.json`. That file is committed and shared"
    is verbatim.
  - `apiKeyHelper` has Scope "Any file". "when the command comes from project or local settings, Claude Code doesn't
    run it until you accept the workspace trust prompt".
- G3: presence-only. Verified:
  - "any non-empty value including `0` turns the behavior on, and you turn the behavior off by unsetting the variable
    or setting it to an empty value"
  - The row: "Setting it to `0` or `false` still disables this traffic".
  - Because settings `env` replaces the shell value, the must-fail case "empty user-env value over launcher `1`" is
    correct.
- G6 precedence: "a user-level deny blocks a project-level allow, because deny rules from any scope are evaluated before
  allow rules".
- G7: the corner `sandbox.enabled` local `false` over user `true` fails. That is correct by ordinary precedence. The
  sandboxing "admin-required" exception needs managed `allowUnsandboxedCommands: false` or `allowManagedDomainsOnly`,
  and neither is in the exercise.
- N1: network-config says "All environment variables shown on this page can also be configured in `settings.json`".
  It also says to put CA and proxy variables in `~/.claude/settings.json` for background agents.
- Corners walked:
  - Each variable placed in the shell only, in user only, in project only, in local only, and conflicting across levels
    (both ends).
  - Each G6 form as allow and as deny, in user scope and in project scope.
  - G7 with the lock on and off: project-only lock, user lock with repository entries.

## Non-blocking (for the authors; judge_content checks them in lesson text)

1. L4 theory, design line 473 ("other hosts prompt, and only `strictAllowlist` in user or managed settings refuses
   them") and the G7 defect cell ("the sandbox prompts for any host"). These hold only in Manual, acceptEdits and plan
   mode.
   - sandboxing.md: auto mode "Refused unless the command listed the host and the classifier approved the list".
     `dontAsk` "Refused". `bypassPermissions` "Allowed without a prompt". Also, `allowManagedDomainsOnly` refuses in
     every mode, and `--settings` can set the lock.
   - Lesson-author: write "outside the allowlist the permission mode decides (in Manual mode you get a prompt). Only
     `strictAllowlist` in user, managed or `--settings` settings, or managed `allowManagedDomainsOnly`, refuses in
     every mode."
   - The L4 quiz item on a project `strictAllowlist` must name Manual mode in its stem.
   - In a lesson this would be a blocking error.
2. Effective-value model scope. Precedence is "in most sessions". settings-reference: when "the Claude Desktop app or a
   self-hosted environment runner starts the session, the launch environment it builds takes precedence". Also, project
   and local `env` (and project `apiKeyHelper`) apply only after workspace trust; llm-gateway-connect troubleshooting
   covers the login-before-trust case.
   - task.md and theory must say "in a terminal session in a trusted folder".
3. Theory "Справка": `allowedProviders: ["customEndpoint"]`. settings-reference: "Claude Code admits it only for the
   exact value a managed `env` block pins". The "Справка" line must add that `ANTHROPIC_BASE_URL` has to be pinned in
   managed `env`. Ungraded.
4. G5 `SSL_CERT_DIR=/etc/corp`. The uv page documents a directory of PEM files and doesn't say whether file names must
   be OpenSSL hash links. I couldn't verify how uv's loader treats plain `.pem` names. Accepting it follows the docs.
   - The brief should state that `/etc/corp` holds only the CA bundle.
   - Before `ready`, the demo should be confirmed on the image (see 12.6 d).
5. G4 leniency, not an inaccuracy. An extra `UV_INDEX` or `UV_EXTRA_INDEX_URL` naming a public host passes G4, although
   the brief says "only from the mirror". Optional: fail any `UV_INDEX`/`UV_EXTRA_INDEX_URL` host other than the mirror,
   and add `UV_EXTRA_INDEX_URL` (deprecated alias of `UV_INDEX`, uv page) to the accepted vocabulary.
6. L1 s2 reason "these are the files Claude Code loads as memory (V11)". memory.md says the default `instructionFiles`
   reads `AGENTS.md` only "when you have no `CLAUDE.md` or `CLAUDE.local.md`". Failing `AGENTS.md` stays a valid
   exercise rule, but task.md and theory must not claim Claude Code loads `AGENTS.md` next to `./CLAUDE.md` by default.
   Say instead that it parks the rule in memory for agents that read it.
7. The research file still owes the 12.6 (a)-(c) corrections: R C1 to V10 and V14, Jain's "open-weights models locally"
   as untested future work into R B10, and Böckeler's exact phrase into R A2. The lesson-author must cite V10, V14 and
   the article, not R C1. Jain's article doesn't say "hosted". Write "a cost-optimised API model (GPT-6 Luna via
   Codex)" rather than "hosted".
8. L2 (w2) on 3.10. The `sqlite3.connect` audit event is documented. The docs don't say whether constructing
   `sqlite3.Connection(...)` directly raises it on every version 3.10-3.13. Add a demo case: dynamic import plus
   `.Connection(":memory:")` in `api.py`, run on the image interpreter. Assessment-side, not a false fact.
9. N3: CRLF is allowed, but the brief says the launcher strips nothing. The brief should say the launcher accepts
   CRLF line endings, so the fiction and the check agree.

## Checked
- code.claude.com, fetched 2026-10-30:
  - env-vars.md: boolean rule, presence-only list, and the rows for NONESSENTIAL_TRAFFIC, DISABLE_WEB_FETCH (v2.1.285),
    AUTH_TOKEN, API_KEY, BASE_URL, the five `USE_*` providers, POWERSHELL_TOOL, DO_NOT_TRACK, SIMPLE_SYSTEM_PROMPT and
    the WebSearch caps.
  - env-vars.md: shell vs settings `env` ("most sessions"); variables ignored in `env`.
- settings-reference.md:
  - `env` precedence, the Desktop and self-hosted exception, the empty value cancelling a shell export, and the full
    "Variables Claude Code ignores in `env`" list.
  - `apiKeyHelper` (scope, trust, both headers), `sandbox.enabled`, `allowedDomains` (wildcards, `:port`),
    `strictAllowlist` (User or managed, v2.1.219), `allowedProviders` (`customEndpoint` pin), and the index for tool
    switches.
- settings.md: the precedence stack, `env` as an ordinary key, lists merge, the trust gate, keys ignored in repository
  files.
- permissions.md: bare names; `Bash(*)` (Bash only); tool-name globs; the bare `WebFetch` vs `WebFetch(domain:*)`
  table; domain rules feeding the sandbox; deny across scopes; project allow and trust.
- sandboxing.md: the locks table (v2.1.285), strictAllowlist, unlisted hosts by mode, allowlist composition, the
  admin-required sandbox rules for `enabled`.
- network-config.md: settings `env` for all its variables, CA store, `NODE_EXTRA_CA_CERTS`, SOCKS, NTLM/Kerberos, the
  background-agent passage, cloud and Desktop exceptions.
- llm-gateway-connect.md: `/v1` curl, the credential warning, settings over shell, `apiKeyHelper` example and TTL,
  provider base URLs.
- memory.md: instruction file locations, the `AGENTS.md` default, `@path` and code spans.
- changelog: 2.1.312 line verbatim; latest 2.1.314.
- docs.astral.sh uv environment reference: UV_DEFAULT_INDEX, UV_INDEX_URL, UV_INDEX, UV_EXTRA_INDEX_URL, SSL_CERT_FILE,
  SSL_CERT_DIR, UV_SYSTEM_CERTS, UV_NATIVE_TLS. `NODE_EXTRA_CA_CERTS` and `PIP_INDEX_URL` are absent.
- Python docs:
  - `sys.stdlib_module_names`: 3.10, top-level only, all platforms.
  - `sys.addaudithook`.
  - sqlite3 audit events `sqlite3.connect` and `sqlite3.connect/handle` (3.10).
  - Future statements may be preceded only by the docstring, comments, blank lines and other future statements. The
    design's "only blank and comment lines" is a safe subset.
- Papers:
  - Agent READMEs abstract: 2,303 files; architecture 68.1%, tests 75.9%, implementation 70.8%, security 14.8%,
    performance 14.5%.
  - Jain, 2026-10-13: Sol 10/10 both ways, Luna 3/10 -> 10/10, ~10.5x tokens, ~3x time, ~7x cost, $0.273 vs $0.406.
    Caveats include open-weights models as untested future work.
  - The other R numbers were verified in round 1. None is graded.
- Course: no contradiction with modules 00/01. 00 L1's local `ANTHROPIC_BASE_URL` stays consistent with the "Справка"
  split between supported routes and a local model.
- Grading threat model: reverse-engineering the grader or the mount is recorded as residual (iii) (2.8, 12.1), per the
  orchestrator default.
- `checkedAt` 2026-10-30: current.

PASS
