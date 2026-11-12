# The recorded review run

`review-run.ndjson` is the stream-json record of one headless run in this project. Claude itself was the
orchestrator: it handed the work to the subagents defined in `agents.json`. No Python pipeline was involved.

## How it was run

```
claude -p --output-format stream-json --verbose --forward-subagent-text \
    --permission-mode acceptEdits --agents agents.json \
    --allowedTools "Bash(python3 -m unittest *)" < task/review-prompt.md
```

- The prompt came on stdin, so no flag value could swallow it.
- The `--agents` file form with `--print` needs Claude Code 2.1.281 or later; `--forward-subagent-text` needs
  2.1.211 or later. With it, the record holds the subagents' text and thinking, not only their tool calls.
- The `init` line shows `permissionMode: "acceptEdits"`. Subagents ran in that mode too: "When the main
  conversation is in `bypassPermissions`, `acceptEdits`, or auto mode, the subagent runs in that same mode and
  Claude Code ignores the `permissionMode` you set" (Claude Code docs, Subagents).
- `--allowedTools "Bash(python3 -m unittest *)"` approved the test command without a prompt. Every test command
  in the record has an argument after `unittest`, so each one matched the rule. The rule reached the subagents'
  calls as well. The Subagents page says of rules added to `permissions.allow` in `settings.json` or
  `settings.local.json`: "these rules apply to the entire session, not only the plugin subagent". Of the
  built-in subagents it says: "Each inherits the parent conversation's permission rules". In the record, the
  `result` line has an empty `permission_denials` list.
- Claude waited for every subagent (foreground), so the `tool_result` of each `Agent` call carries that
  subagent's final report.
- The session had the built-in `general-purpose` subagent.
- When the coder stopped, the project's `SubagentStop` hook (matcher `coder`, `.claude/settings.json`) wrote
  `git diff` to `run/change.diff`. Hooks do not appear in the record.

## How to read the record

- One JSON object per line. The record was normalised to one content block per line for reading, so one
  assistant turn with three blocks is three lines that share `message.id`.
- `parent_tool_use_id` is `null` for the main conversation. For a subagent's messages it is the id of the
  `Agent` `tool_use` that started that subagent; a subagent started by another subagent carries the id of the
  call that started it.
- A subagent's report reaches its parent as a `tool_result` whose `tool_use_id` is the id of that `Agent` call.
  That line belongs to the parent's conversation.
- The tool that starts a subagent is named `Agent` in `tool_use` blocks and `Task` in the `tools` list of the
  `init` line. An `Agent` call without `subagent_type` starts `general-purpose`: "When Claude calls the Agent
  tool without a `subagent_type`, it gets the built-in `general-purpose` subagent" (Claude Agent SDK docs,
  Subagents in the SDK). "Fork mode is on by default from Claude Code v2.1.302" (Claude Code docs,
  Subagents); the SDK page says Claude starts a fork "by calling the Agent tool with `subagent_type: "fork"`",
  an explicit type. This record has no fork.
- The last line is the `result` message of the whole run.
- An agent path names the agent that made a call: `main`, `main/coder`, `main/coder/explorer`. Two instances of
  one type under one parent (the coder started the explorer twice) share a path; the record tells them apart
  by the `Agent` call that started each.

## The contracts

Each contract lists the tools the role may call, what it receives (Input) and what it returns (Report).
Report formats are the JSON shapes in `agents.json`.

| Role (type) | Tools | Input | Report |
|---|---|---|---|
| main (orchestrator) | Read; Write under `run/` only; Agent | the prompt (`task/review-prompt.md`) | `run/report.md` |
| coder (`coder`) | Edit, Read, Grep, Glob; Bash for `python3 -m unittest ...` only; Agent for `explorer` only | the task and the acceptance criteria | `{diff_path, summary}` |
| explorer (`explorer`), started by the coder | Read, Grep, Glob | a search request from the coder | a list of locations with quotes, and nothing else |
| security reviewer (`security-reviewer`) | Read, Grep, Glob | the change and the acceptance criteria, as text or by path; not the coder's report or reasoning | findings |
| performance reviewer (`performance-reviewer`) | Read, Grep, Glob | the change and the acceptance criteria, as text or by path; not the coder's report or reasoning | findings |
| tests reviewer (`tests-reviewer`) | Read, Grep, Glob; Bash for `python3 -m unittest ...` only | the change and the acceptance criteria, as text or by path; not the coder's report or reasoning | findings, plus the test status |
| synthesizer (`synthesizer`) | Read | the reviewers' reports (findings and, for tests, the test status), plus which sections were reviewed | merged findings with `source_ids`, plus each section's status as its reviewer reported it (reviewed or failed; for tests, the test status the tests reviewer reported) |
| summarizer (`summarizer`) | Read | the synthesizer's report (merged findings and section statuses) | `{summary, finding_ids}`; it refers to findings by id and does not cite locations itself |

A finding is a statement about the code. It cites `file`, `line` and `quote`: the file exists in this project,
the line is in range, and the quote is text from that line.

## The definitions were looser than the contracts

The `agents.json` definitions were looser than the contracts: the security and performance reviewers were given
Bash, and `explorer` had no `tools` field (it inherits). The coder's `Agent` cannot be narrowed to `explorer`
inside a subagent definition either. So the harness let through calls that the contracts forbid.
