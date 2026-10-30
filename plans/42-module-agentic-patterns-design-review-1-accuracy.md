# #42 judge_design round 1: accuracy

Reviewed: `plans/42-module-agentic-patterns-design.md` (revision 1) against
`plans/42-module-agentic-patterns-research.md` and primary sources fetched 2026-10-30.

FAIL: 8 blocking issues. Most of them are in L4 `contour-config`: the closed-set grading fails values and
forms the Claude Code docs allow, and the reference contour can't reach its own mirror. L1-L3 and L5
facts hold.

## Blocking

### 1. K7/K9: `CLAUDE_CODE_DISABLE_WEB_FETCH` is a standard on/off boolean. It isn't presence-only and it isn't `1`-only.
- Design L4 K9 says the variable takes "any non-empty value: R C3 says any non-empty value opts out", and that
  "when it is the only WebFetch control K7 requires `1`". It lists "WebFetch not denied with the env set to
  `true`" as **must fail**.
- Source (https://code.claude.com/docs/en/env-vars.md, 2026-10-30): row "Set to `1` to turn off the WebFetch
  tool. The WebSearch tool stays available." General rule: "For variables that turn a behavior on or off, set
  `1`, `true`, `yes`, or `on` to turn it on and `0`, `false`, `no`, or `off` to turn it off, in any casing."
  The presence-only list is exactly `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_TELEMETRY`,
  `DISABLE_ERROR_REPORTING`, `CLAUDE_CODE_TMUX_TRUECOLOR`, `IS_DEMO`. `CLAUDE_CODE_DISABLE_WEB_FETCH` isn't on
  it. R C3 says "any non-empty" only for the DISABLE_TELEMETRY/ERROR_REPORTING pair, so the K9 attribution
  is wrong too.
- Fix target: K7 and K9 rows plus the must-fail and must-pass lists.
  - K7 counts WebFetch as off when the value is one of `1|true|yes|on`, in any case.
  - `0|false|no|off` leave WebFetch on, so they fail K7 when WebFetch isn't denied. Add `=0` and `=off`
    with WebFetch not denied as must-fail.
  - Any other value is outside the exercise, and the message must say exactly that.
  - Move "env `true`, WebFetch not denied" to must-pass and add `TRUE` and `On`.
  - Delete the "any non-empty" attribution.

### 2. K7: the deny forms the docs allow aren't enumerated, and the `WebFetch(domain:*)` reason is false.
- Design K7 accepts only the bare string. It rejects "`WebFetch(domain:*)` and other specifiers ... as outside
  the exercise (their semantics are not in R)".
- Source (https://code.claude.com/docs/en/permissions.md, 2026-10-30):
  - "`Bash(*)` is equivalent to `Bash` and matches all Bash commands. As a deny rule, both forms remove the
    tool from Claude's context."
  - "Deny and ask rules also accept glob patterns in the tool-name position. ... A tool matched by a
    bare-name glob deny rule is removed from Claude's context, the same as a bare tool name."
  - On `WebFetch(domain:*)` in deny: "Claude Code keeps the tool and refuses each fetch, and sandboxed
    commands can't reach any host."
- Fix target: K7's alternatives column and the matching rule.
  - Enumerate every form:
    - Bare name: pass.
    - Tool-name glob that matches the full name, such as `Web*` or `WebSe*`: pass. These are documented to
      remove the tool.
    - `"*"`: reject because it removes every tool, Bash included, and the brief needs Bash. Give that
      reason, not "outside the exercise".
    - `WebSearch(*)` and `WebFetch(*)`: the `Tool(*)` equivalence is documented only for Bash. Either
      accept them, or reject them with an honest "not documented for this tool" message.
    - `WebFetch(domain:*)` in deny: fail with the documented reason. It keeps the tool and also cuts
      sandboxed commands off from the mirror and git host the brief requires.
  - Add each form to must-pass or must-fail.

### 3. K8 and O4: `allowedDomains` only pre-allows hosts. It doesn't make "песочница только с внутренними хостами" true. Wildcards, ports and `WebFetch(domain:)` allow rules are documented.
- The design grades only project `sandbox.enabled` plus `sandbox.network.allowedDomains`. It says "wildcard and
  scheme forms are not in R: rejected as outside the exercise", and that `strictAllowlist` paths are pending.
- Sources (https://code.claude.com/docs/en/sandboxing.md and settings-reference.md, 2026-10-30):
  - "When a sandboxed command connects to a host that isn't in your allowed domains, the command stays in
    the sandbox and waits for a decision." Manual, acceptEdits and plan mode: "You get a prompt".
    `bypassPermissions`: "Allowed without a prompt".
  - `sandbox.network.strictAllowlist`: Scope "User or managed". Setting it in ".claude/settings.json or
    .claude/settings.local.json has no effect". "Requires Claude Code v2.1.219 or later".
  - "The allowlist is `allowedDomains` plus domains from `WebFetch(domain:...)` allow rules."
  - `allowedDomains`: "Wildcards such as `*.example.com` match subdomains, and an optional `:port` suffix
    limits an entry to one port".
- Fix target: O4 wording, the K8 row, the starter and the must-fail list.
  - (a) Either grade `sandbox.network.strictAllowlist: true` (JSON true) in `home/.claude/settings.json`,
    with must-fail "strictAllowlist only in project settings (no effect)". Or reword O4, K8 and the theory
    to "pre-allows only the internal hosts; other hosts prompt, or are refused only with strictAllowlist
    in user/managed settings". Grading it is recommended: it is the realistic bank setup and the scope trap
    fits the lesson.
  - (b) K8 must fail any `permissions.allow` entry `WebFetch(domain:X)` where X is outside the two hosts,
    `WebFetch(domain:*)` in allow included. These widen the sandbox allowlist. Add both to must-fail.
  - (c) The alternatives column must say wildcards and `:port` are documented:
    - `*.corp.local` is rejected because it is broader than the brief's two hosts. The message must give
      that reason, not "not valid".
    - `pypi.corp.local:443` is a documented, narrower form. Decide whether it passes (recommended, together
      with git's port as the brief states it) or fails with an exercise reason. The brief must then name
      the ports either way.

### 4. The reference contour can't reach the HTTPS mirror. `NODE_EXTRA_CA_CERTS` covers Claude Code only, and K9 rejects the documented uv fix.
- In the brief, the CA bundle `/etc/corp/ca-bundle.pem` is "not installed in the OS store" and the mirror is
  `https://pypi.corp.local/simple`. K3 sets only `NODE_EXTRA_CA_CERTS`. The K9 closed list rejects every
  other launcher key.
- Sources:
  - uv env reference (https://docs.astral.sh/uv/reference/environment/, 2026-10-30): `SSL_CERT_FILE` "Path to
    a CA certificate bundle file for TLS connections. When set, this overrides the default certificate
    source (bundled Mozilla roots or system certificates)". `UV_SYSTEM_CERTS` loads the platform store,
    which doesn't hold the CA here.
  - network-config (code.claude.com, 2026-10-30): `NODE_EXTRA_CA_CERTS` is Claude Code's setting ("configure
    Claude Code to trust it directly").
- So a learner who correctly adds `SSL_CERT_FILE=/etc/corp/ca-bundle.pem` fails K9 as "outside the exercise",
  and the reference config teaches a contour where `uv` fails TLS against the mirror.
- Fix target: brief, K3/K4/K9 and theory.
  - Require `SSL_CERT_FILE=/etc/corp/ca-bundle.pem` in `launcher.env` (new rule or part of K3), and add it to
    the K9 allowed keys. Must-fail: CA only via `NODE_EXTRA_CA_CERTS`.
  - Decide git (HTTPS to `git.corp.local` needs `GIT_SSL_CAINFO` or `http.sslCAInfo`). Either the brief says
    git uses SSH, or allow or require `GIT_SSL_CAINFO`.
  - Theory: every tool has its own trust setting, and `NODE_EXTRA_CA_CERTS` reaches only Node-based Claude
    Code.
  - Alternatively, change the brief so only the gateway sits behind the corporate CA. The first option
    is better teaching.

### 5. K4: `UV_INDEX_URL` is a documented equivalent of `UV_DEFAULT_INDEX`, and K9 fails it.
- Source (uv env reference, 2026-10-30): `UV_INDEX_URL` "Equivalent to the `--index-url` command-line argument.
  If set, uv will use this URL as the default index ... (Deprecated: use `UV_DEFAULT_INDEX` instead.)" R C6
  names only `UV_DEFAULT_INDEX` and the `--index-url` flag. The design's K4 alternatives column says
  `--index-url` is excluded because the brief is "launcher only", but `UV_INDEX_URL` *is* a launcher variable.
- Fix target: the K4 row, the K9 allowed keys and must-pass.
  - Accept `UV_INDEX_URL=https://pypi.corp.local/simple` as an alternative. The message may note the
    deprecation.
  - Fail when both are set with different values.
  - Add it to must-pass.
  - Also state that the brief says the team installs with uv. The starter is stdlib-only, so nothing else
    names uv.

### 6. Placement: the docs document settings `env` for every variable and recommend `~/.claude/settings.json` for gateway and network variables. The design rejects it and enumerates it only for K1.
- Design: K1 is rejected in settings by K9 ("the brief puts endpoint selection in the launcher"). K2 and K3
  are launcher-only, with no settings-env alternative listed. K9 forbids `ANTHROPIC_BASE_URL` in "either
  settings `env`".
- Sources (2026-10-30):
  - llm-gateway-connect.md: "If you export the gateway only in your shell, it doesn't reliably reach
    background agents ... Use a settings file for any gateway that background agents must always route
    through." Also "When both a shell export and a settings-file `env` block set the same variable, the
    settings-file value applies."
  - network-config.md: "All environment variables shown on this page can also be configured in
    `settings.json`", and "Set network variables in settings, not the shell ... settings are the only
    configuration that reaches every background session".
  - Item 12.4(b) is therefore answered: yes, `NODE_EXTRA_CA_CERTS` can be set in settings `env`.
- Fix target: K1-K3, K9 and the brief.
  - Recommended: accept K1, K2, K3 and the `DISABLE_*` keys in `home/.claude/settings.json` `env` as an
    alternative to `launcher.env`. A key may sit in both places only with the same value, because the
    settings value wins. Keep project `env` rejected for the endpoint and credentials (vendor warning:
    "committed and shared").
  - Otherwise keep launcher-only, but enumerate the settings-env placement in every row with a concrete
    brief reason. Theory must then state the vendor's background-agent caveat (`processWrapper` /
    corporate launcher).
  - Either way, uv's `UV_DEFAULT_INDEX` and `SSL_CERT_FILE` stay in the launcher. They must reach the
    developer's terminal, not only Claude Code, so the brief's "for every tool" reason holds there.

### 7. K9 and theory: the provider list is incomplete.
- Design and R C1 name three provider modes (`CLAUDE_CODE_USE_BEDROCK|VERTEX|FOUNDRY`) and the supported route
  "gateway, Bedrock, Vertex, Foundry".
- Source (env-vars.md and llm-gateway-connect.md, 2026-10-30): the provider variables are
  `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`,
  `CLAUDE_CODE_USE_ANTHROPIC_AWS` ("Use Claude Platform on AWS") and `CLAUDE_CODE_USE_MANTLE`. The
  provider-specific base URLs are `ANTHROPIC_BEDROCK_BASE_URL`, `ANTHROPIC_VERTEX_BASE_URL`,
  `ANTHROPIC_FOUNDRY_BASE_URL` and `ANTHROPIC_AWS_BASE_URL`.
- Fix target: K9's forbidden list in settings `env` and its must-fail list (add one non-R provider, such as
  `CLAUDE_CODE_USE_MANTLE=1` in home `env`); the L4 theory route list.
  - Use the complete named list. Don't use a `CLAUDE_CODE_USE_*` glob: `CLAUDE_CODE_USE_POWERSHELL_TOOL` is
    not a provider.

### 8. L4 theory: `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT` is stated more broadly than the source.
- Design L4 says "`CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT` for unrecognised model names (R C1, 2.1.312)", in the
  local-model and gateway context.
- Sources (2026-10-30):
  - changelog 2.1.312: "Changed Bedrock, Vertex, Foundry and Mantle to use the shorter system prompt for
    model names Claude Code doesn't recognize ...; set `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT=0` to keep the full
    prompt".
  - env-vars row: "When unset, Haiku 4.5, Sonnet 5, Opus 4.7, and earlier models in those families use the
    full prompt by default, and newer models use the shorter one. Set to `1` to use the shorter prompt on
    any model. Set to `0`, `false`, `no`, or `off` to use the full prompt on any model".
- Fix target: R C1 and the L4 theory line. State the variable as the env-vars row does, and say the 2.1.312
  unrecognised-name change was for the four cloud providers. Don't claim it for an `ANTHROPIC_BASE_URL`
  gateway or a local model. Theory only, nothing graded.

## Non-blocking
1. Jain: the article lists open-weights models among the untested cases ("Untested: ... open-weights models").
   L4's "weaker local model -> more sensors" must say it extrapolates from a hosted cost-optimised model.
2. Böckeler: my fetch rendered the phrase as "a positive kind of prompt injection". The design and R have
   "positive form". The lesson-author must copy the article's exact words or paraphrase without quotes.
3. 2.8 says `usercustomize`/`sitecustomize` are defeated by `-I`. `-I` means `-E -P -s`: it drops the user
   site (usercustomize), cwd and `PYTHONPATH`. A `sitecustomize` in the image's system site-packages still
   loads. Say "sitecustomize on cwd, `PYTHONPATH` or the user site". This is the same accepted 00/01
   convention, not a new hole.
4. K1 `https://llm.corp.local/` and K4 `.../simple/` (trailing slash): undocumented either way. task.md prints
   the exact value, so failing is acceptable if the message names the expected form. Accepting one trailing
   slash is kinder.
5. L4 quiz "proxy uses SOCKS": the docs say only "Claude Code does not support SOCKS proxies", plus "consider
   using an LLM Gateway" for NTLM/Kerberos. The key must not invent a documented remedy.
6. K6: theory should add that a committed token must be revoked or rotated, because deleting it leaves it in
   git history. Nothing graded.
7. `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` (documented, relevant to a short-lived token) and `DO_NOT_TRACK` (a
   standard boolean: `0` leaves telemetry on) are plausible launcher keys. K9 rejects them as "outside the
   exercise". Either allow them, with `DO_NOT_TRACK` counted only for on-values, or list them in the brief as
   not wanted.
8. Section 12.4, pending addendum. Nothing here blocks the design once items 3, 4 and 6 above are applied:
   - (a) Answered here: `sandbox.network.strictAllowlist` (user, managed or `--settings` only; no effect in
     project or local settings; v2.1.219+), `sandbox.allowUnsandboxedCommands`, `sandbox.failIfUnavailable`.
   - (b) Answered: yes (network-config). It feeds blocking item 6.
   - (c) Verified: Python docs, `datetime.UTC` "Added in version 3.11".
   - (d) Not verifiable without the image. Not blocking: membership is computed by the same interpreter, and
     none of the hidden-root names is a PEP 594 removal. It must still be run before `ready`.
   - (e) `make` in `academy-workspace:dev`: a demo and dev check. It blocks L2 `ready`, not the design.
9. Threat model 2.8 is stated correctly: residual (iii), including the importable `arch_rules.py` and
   `deps_rules.py`, is recorded, not hidden.

## Checked
- Claude Code docs (fetched 2026-10-30):
  - env-vars.md: rows for ANTHROPIC_BASE_URL, AUTH_TOKEN, API_KEY, DISABLE_NONESSENTIAL_TRAFFIC,
    DISABLE_TELEMETRY, DISABLE_ERROR_REPORTING, DO_NOT_TRACK, DISABLE_WEB_FETCH, CERT_STORE,
    SIMPLE_SYSTEM_PROMPT, the USE_* providers, ENABLE_GATEWAY_MODEL_DISCOVERY and DISABLE_AUTOUPDATER; the
    boolean-parsing rule; the presence-only list; settings `env` support.
  - network-config.md: proxy order, SOCKS, NTLM, CA store values and default, NODE_EXTRA_CA_CERTS, mTLS,
    settings env, the background-agent note, skipWebFetchPreflight.
  - llm-gateway-connect.md: base URL without `/v1` (curl to `$ANTHROPIC_BASE_URL/v1/messages`), header
    mapping, the "committed and shared" warning, apiKeyHelper in `~/.claude/settings.json`, the 5-minute
    TTL, settings-over-shell precedence, provider gateway variables.
  - permissions.md: bare rules, `Bash(*)` equivalence, tool-name globs, WebFetch domain rules, bare vs
    `domain:*`.
  - sandboxing.md: allowlist starts empty, unlisted host behaviour by mode, wildcards and ports, the
    strictAllowlist scope and version, WebFetch(domain:) allow rules feeding the sandbox, what the sandbox
    doesn't cover.
  - sandbox-environments.md: "Isolation also does not change what is sent to the model", srt beta, dev
    container firewall, --dangerously-skip-permissions.
  - settings-reference.md: sandbox.enabled boolean, allowedDomains format, strictAllowlist entry, scopes.
  - changelog: 2.1.314 blockWritesOutsideWorkingDirectories; 2.1.312 shorter prompt.
  - allowedProviders `customEndpoint` and v2.1.285 (docs search).
  - best-practices.md: "single most useful line", "Most of the time, you want Claude to decide", the
    hooks-for-preferences tip, the typecheck vs Stop hook passage, the four-way triage, "What you can stop
    doing" (emphasis, think hard, describe architecture), two corrections then `/clear`, no "Avoid common
    failure patterns" section.
- Codex config reference (learn.chatgpt.com): `wire_api` responses only, reserved IDs, `oss_provider`
  lmstudio|ollama, `web_search` four modes with default cached, `sandbox_workspace_write.network_access`
  boolean with no default.
- uv env reference: UV_DEFAULT_INDEX, UV_INDEX_URL (deprecated alias), SSL_CERT_FILE, UV_SYSTEM_CERTS;
  PIP_INDEX_URL not listed.
- Python docs: `sys.stdlib_module_names` (3.10, top-level packages only), `datetime.UTC` (3.11). `tomllib`
  3.11 not re-fetched (known).
- Papers and reports: Spracklen et al. v3 (5.2% / 21.7%, 576,000, USENIX Sec 2025); GitChameleon (48-51%,
  328 problems); METR reward hacking (80% -> 70%/80%/95%, 39/128, 8/1,087); Jain 2026-10-13 (Sol 10/10 both
  ways, Luna 3/10 -> 10/10, ~10.5x tokens, ~3x time, ~7x cost, $0.273 vs $0.406, caveats); Böckeler
  2026-04-02 (definitions, steering loop, keep quality left, ambient affordances).
- Not re-fetched: the OpenAI post (403 to fetchers; I used the orchestrator addendum as instructed), Agent
  READMEs 68.1%, Hashimoto, Anthropic engineering posts, llms.txt. These are theory-only and none is graded.
- Course: no conflict with 00/01 lessons. Only 00 L1 mentions `ANTHROPIC_BASE_URL` (Ollama, localhost),
  which is consistent.
- `checkedAt` 2026-10-30: current.
