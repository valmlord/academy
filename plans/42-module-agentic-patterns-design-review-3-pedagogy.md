# #42 judge_design round 3: pedagogy

Design reviewed: `plans/42-module-agentic-patterns-design.md`, revision 3 (903 lines, read in full, including sections
14 and 15). Verdict: PASS. No blocking issues. Round-2 B1 is resolved, and non-blocking items 1-7 have all landed.
Four new non-blocking items follow.

## Round-2 B1 (L4 hands the answers over): resolved

### Task text (design:617-638)
- Each of G1-G7 and N1-N4 is now stated as the brief requirement it protects, and none of them names a key, a file or a
  value. G1 "every Claude Code request goes to the brief's gateway". G5 "uv in the team's terminals trusts the bank's
  root CA". G7 "sandboxed commands reach the mirror and no other host, and no prompt can widen that". N4 "the project's
  hooks stay and stay on". The traps from round 2 (the `0`/`false` presence-only trap, the `0|false|no|off` trap, the
  ignored repository `allowedDomains`, `SSL_CERT_FILE`) are gone from the learner's text.
- The general rule appears once (627-637). It covers the files the check reads (with `home/.claude/settings.json`
  standing for `~/.claude/settings.json`), the definition of effective value with its precedence, "any documented form
  with the required effect passes, wherever the documentation says it takes effect", the brief's narrowing limits, and
  the feedback rule (id only, no file, key or value, no cap). It names files the check reads, not where any one answer
  lives, so it does not leak a per-defect answer.
- The table of planted defects is marked as the grader's and the mentor's reference only (574). Section 2.6 (100-102)
  now makes this the general convention for "find" outcomes.

### Check messages (design:596-599, 776)
`contour-config` reports each failing rule once, as its id plus the requirement, with no file, key or value and no cap.
Prototype row 25 confirms the learner's view on the starter: seven lines "Gn: <brief requirement>".

### Does the learner still have to find the defects?
I read the task text and the message on the untouched starter as the learner sees them (per the 2026-10-30
judge_mistakes entry). What remains for the learner:
- Even after the check names G1-G7, they still map each requirement to a tool, a file and a scope. This includes seeing
  that the comment "# corporate CA, for every tool" is false for uv (G5), and that project-scope `strictAllowlist` does
  nothing, so the user file has to change (G7).
- They spot an absence (G3: nothing sets the variable).
- They choose a form that works under the brief's limits (G4/G5 only in `launcher.env`; G2 helper instead of a token).
The outcome verb "Находит" is now practised. The O4 row in section 6 (694) states this.

### Fair for a learner weak in networking, within the time?
- Fair: each rejected form follows a semantic that the L4 theory teaches (533-547: gateway vs CA vs mirror, `/v1`,
  committed credentials, settings `env` over shell plus precedence, presence-only vs on/off, the web-tool deny forms,
  the scope of `strictAllowlist` with the permission mode, per-tool CA trust), or it follows a brief line. The
  `UV_INDEX` case is the exception (non-blocking 1).
- Doable: the starter is small (four files, about 15 relevant keys). The check gives uncapped per-requirement
  feedback, and the mentor is suggested after 5 failed attempts. The re-timed hands-on (712) is: brief to requirement
  list 4, find with effective value 13, fix 10, iterate 8, a total of 35. That is plausible for 7 requirements plus 4
  guards when the theory has just covered each principle. The G5 hint fallback stays ready (715), and the student run
  records unaided finds and the find-step minutes (643-644). L4 hands-on is 58%, at or above half.

## Round-2 non-blocking items: verification
1. Step 1 narrowed ("the whole project"; "a command for one part ... is not this step", 108-109). R08 step 1 now has a
   reason (254). Landed.
2. Every "n" cell in the walk table now has a reason (247-258). The R05/R06/R07 step-5 cells now read "found after the
   turn it costs one edit". The hook files ship in L1, and the student run confirms R08 (259). Landed.
3. Count feedback computed with the exact search: 19.2% for "sure of 8" against Stepan's limit of 15%, so binary is kept
   (280-286, 685, 758). The decision follows the rule. The task text covers part of how feedback works (non-blocking 2).
4. Only the builtin `compile` is banned. `re.compile` is fine in both (w1) and item 4 (389-390, 420-421, prototype row
   15). Landed.
5. L3 item 5 now cites I02 (520). Landed.
6. `claude -p` is glossed in L5 theory (651-652) and has a concept row (178). PostToolUse and `/effort` rows are added
   (176-177). Landed.
7. `/status` is replaced by "write which file's value wins (the effective value as defined above)" (639-641). Landed.

## Blocking
None.

## Non-blocking
1. [design:546-547, 584] L4 theory names only "uv's default index (V13)". G4 rejects `UV_INDEX` alone, because it
   adds an extra index and keeps the public default. That form is the one a learner who knows pip's `--extra-index-url`
   habit is most likely to try. The general rule ("a form the documentation says has a different effect fails") does
   make it fair, but the rejection rests on a doc page the lesson never shows. lesson-author: add one sentence to the
   L4 theory on uv: "the default index is replaced by one variable; another variable only adds indexes, and the public
   default stays". Name both variables, as the theory does for `NODE_EXTRA_CA_CERTS` vs `SSL_CERT_FILE`.
2. [design:327-328] L1 item 6 says "3 scored submissions" and items 1-5 are "checked free of charge". It does not say
   what makes a submission scored, or what happens after the third. lesson-author: "a submission counts only when
   items 1-5 pass; after the third counted 'не пройдено' the check closes and the mentor reviews your placement; the
   mentor does not reveal which cards are wrong". Add to "Как работать": "fix every free stage-0 message before you
   spend a counted submission; re-walk every card you hesitated on before each counted one".
3. [design:597-598] The example message "G5: uv в терминалах команды доверяет корневому CA банка" states the
   requirement in the positive. As a failure line it can read as a pass. Prefix each line with "не выполнено:", or
   phrase it as the unmet state (round 2's example "не доверяет"). Keep the ids and the absence of file, key or value.
4. [design:619-620] G2's text "no static token is left in any file of the workspace" is broader than the check, which
   scans for the planted token string and for the two credential keys. The text is stricter than the check, so no
   honest learner fails because of it. Section 13's "both ways" note should record it as an intended asymmetry, so
   that judge_content does not flag it.

## Checked
- Loaded: the role file, `judge_mistakes.md` (including the 2026-10-30 pedagogy entry, which I applied to L4),
  `learner/profile.md` (weak in networking, Python developer), `learner/journal.md` (no entries), and my round-2
  report. `_contract.md`, `docs/learning-process.md` and `docs/course-reference.md` were not re-read: revision 3 does
  not change the lesson types, the check kinds or the topic mapping (sections 8 and 13). A grep shows uv is not taught
  in `course/`; the profile makes it plausible that the learner knows it, which is acceptable.
- Round-2 B1: the L4 "Готово, когда" item by item against G1-G7 and N1-N4. The general rule against the "Effective
  value" definition and the Accepted forms column. The message specification (596-599) and prototype row 25. The O4
  row in section 6. The re-timed section 7 row. The student-run instruction and the fallback.
- For each L4 defect: what the learner must still do after the starter's message (G1-G7), and which theory line or
  brief line supports each rejected form (all except the `UV_INDEX` case, non-blocking 1).
- 2.6 diff for L4, both ways: every rule and guard has a requirement line. G6 "keeps file and shell tools" covers the
  rejected globs. G7 "no prompt can widen" covers the scope of `strictAllowlist`. N4 "stay on" covers
  `disableAllHooks`. The only asymmetry is G2, where the text is stricter (non-blocking 4).
- Round-2 non-blocking items 1-7 against the cited lines. The L1 feedback decision against Stepan's 15% rule.
- Time: 60+75+70+60+50 = 315; hands-on 38+55+48+35+38 = 214 (67.9%). The per-part sums in section 7 add up for every
  lesson, L4 4+13+10+8 = 35.
- Threat model of record (2.8) applied. Nothing here depends on an out-of-scope class.
