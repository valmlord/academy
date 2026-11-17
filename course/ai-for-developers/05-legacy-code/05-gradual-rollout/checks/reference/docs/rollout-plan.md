# Rollout plan: the agent in the parcel-desk team

## Stages

Each stage starts only when the previous one met its signals for four weeks. Risk grows from top to bottom.

1. **Review only.** The reviewer of a pull request runs `/code-review` in their own session and posts the
   findings they agree with; the agent changes nothing. Managed Code Review would be an alternative, but it is
   available only on the Team and Enterprise plans, and we are on neither. Even there it never approves or
   blocks a pull request, and it reads `REVIEW.md` from the base branch. May: read the diff and the code
   around it, suggest. May not: push, approve, merge, edit files.
2. **Small patches through the gate.** The agent proposes patches in the modules of stage 2's scope only, and
   every patch goes through `scripts/agent_gate.py` before a human reviews it. May: change `shipping/` code and
   `docs/`, add new tests. May not: edit or delete existing tests, touch `data/`, `config/` or anything else,
   send more than 5 files or 200 changed lines, merge.
3. **Wider scope.** The same gate, with more modules in scope as their nets are proven (see below). May:
   what stage 2 allows, in the wider scope. May not: merge without a human approval, change the gate rules.

## Scope of each stage and how it is proven

A module enters stage 2 or 3 only after its test net was checked by mutants or by a recorded sabotage run: a
deliberate change of behaviour that the net must catch, with the red run saved in `docs/sabotage/`.

- Stage 2 scope: `shipping/quote.py` and the new `shipping/pricing.py`. Evidence: the quote-net mutants Q1-Q10
  of lesson 4 all die, and the pricing extraction kept behaviour on random inputs.
- `shipping/labels.py` and `shipping/manifest.py`: none yet. Their nets from lesson 3 were checked by mutants in
  a copy, but not on this branch; they stay out until a recorded sabotage run on this branch is in `docs/sabotage/`.
- Stage 3 scope: none yet. No other module has a checked net.

## Outcome signals and their baseline

Measured on our own process, with the eight weeks before stage 2 as the baseline:

- change failure rate: the share of merged changes that were reverted or needed a fix within 7 days.
  Baseline: 2 of 31 merged changes, 6.5%;
- lead time from the first commit to merge, median. Baseline: 2.1 days;
- review round trips per pull request, median. Baseline: 1.

Not success criteria: lines written by the agent, the number of agent pull requests, the share of accepted
suggestions. They count activity, not results.

We decide by measurement, not by how fast it feels: in the METR 2025 study experienced developers were slower
with AI, completion time 19% longer, while they believed they were about 20% faster. The 2026 METR update
estimates returning developers faster, time 18% shorter, but the interval crosses zero and the authors call it
only very weak evidence.

## Stop or rollback condition and the DRI

- Stop and roll back to the previous stage when the change failure rate of agent changes is above 10% over
  any 20 merged agent changes, or when one agent change reaches production with a price difference.
- Roll back means: the agent's write access is removed in the CI config, and the last agent changes are
  reverted if they caused the failure.
- DRI: Irina Volkova, tech lead of parcel-desk. She decides on every stage change and every rollback; the gate
  rules change only with her approval.

## Memory and settings of the CI agent

- The CI agent runs `claude -p` with `--bare`. Bare mode skips the auto-discovery of hooks, skills, custom
  commands, subagents, installed plugins, MCP servers, auto memory and CLAUDE.md, so the root `CLAUDE.md` does
  not load by itself. We pass the memory text explicitly with `--append-system-prompt-file ci/agent-memory.md`,
  a file built from the root `CLAUDE.md` and the `.claude/rules/` texts. The docs do not say what `--bare` does
  with `.claude/rules/`, so the rule texts go into that file too.
- Without `--bare`, `claude -p` discovers and loads them as an interactive session would.
- The committed `.claude/settings.json`: its `deny` and `ask` rules apply at once. Its `permissions.allow`
  rules wait for the folder to be trusted, and under `claude -p` in a folder nobody trusted they are not used.
  So every permission the CI agent needs is granted on the command line (`--allowedTools`), not in the
  committed allow list, and the denials we rely on stay in the committed file.
