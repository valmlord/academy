# #28 db schema: code review round 2, architecture

Judge: architecture. Input: round-1 reports (architecture PASS, security FAIL on I8b, operations PASS), the
re-test section of `plans/28-db-schema-test-report.md` (lines 117-175), design rev 4
(`plans/28-db-schema-design.md`), and the three changed files, read in full.

## Process (`.claude/pipeline_state.json`)
13 judge votes, all `source: "hook"`, none inline. The judge_code round 1 security FAIL is recorded and a
security PASS follows it.

## `packages/db/src/migrate.ts` (constructor inside the connect stage)
- 84-89: `let client: pg.Client | undefined`, `stage = "connect"`, construction inside the `try`. The
  constructor throw is real and synchronous: `pg@8.23.1/lib/connection-parameters.js:59-60` calls
  `parse(config.connectionString)`, and `pg-connection-string@2.14.1/index.js:88-99` runs `fs.readFileSync`
  for sslcert/sslkey/sslrootcert (`:127` throws for libpq-compat `verify-ca` with no CA). The throw happens
  while `stage === "connect"`, so 98-103 wraps it as `MigrationError("connect", ...)` with the fs error as
  `cause` (`errors.ts:54-55`, `super(message, { cause })`).
- Message: `errorCode` (130-143) finds `ENOENT` on the fs error, so the message is
  `could not open the migration session (ENOENT)`. That is the 4.7 connect text. The libpq-compat throw has
  no `code`, so it gives `(unknown)`. That is still the contract.
- `finally` (104-107): when the constructor threw, `client` is `undefined`, `client?.end()` evaluates to
  `undefined`, and `await undefined` does not throw, so the `MigrationError` from the catch propagates
  unchanged. When the client exists, the behaviour is the same as in round 1: the I4 mutation (a) still
  covers it, and U5 case 1 (refused connect, then `end()`) is green, so `end()` on a never-connected client
  neither hangs nor masks the error.
- Validation order (74-82) is unchanged: option and URL errors still come before any construction, so U4,
  U6 and U7 keep their meaning (tester: 21/21 in options.test.ts).
- Comment 87-88 says why (sync file read). It does not mention the sslmode throw, so it is incomplete but
  not false. Not blocking.

## `packages/db/test/unit/options.test.ts` U5 case 2 (75-84)
- The URL `...127.0.0.1:1/x?sslrootcert=/nonexistent-academy-28/root.crt` passes `assertPostgresUrl`.
  `pg-connection-string:40-41` copies the query into config, and `:99` throws ENOENT.
- Can it fail? Yes, in two independent ways. (1) With the client built outside the try, `rejectionOf(...,
  MigrationError)` gets the raw `Error: ENOENT`: the tester's re-test mutation 4 showed this red at `:79:19`.
  (2) If pg ever stopped reading the file in the constructor, the call would fail at connect with
  `ECONNREFUSED`. The `ENOENT` assertion (82) would then be red, so the test cannot pass just because port 1
  refuses. The canary assertion (83) inspects the fs error, which carries `path`, `syscall` and `errno`, not
  the URL.

## `packages/db/test/integration/client.int.test.ts` I8b (37-40, 78)
- `loggedArgument`: a string as is, anything else `inspected` (depth Infinity, `test/assertions.ts:7-9`).
  `console.error` formats with `util.inspect` at depth 2, so the test checks at least as deep as the real
  output (it is stricter, never blinder). The import `../assertions.js` resolves to `test/assertions.ts`,
  and every import in the file is used.
- Can it fail? Tester mutations 1 (`pool.options` as an object argument) and 3 (URL in the message) are red
  at `:81:24`. Mutation 2 (the same leak with `.map(String)`) is green, which proves the old rendering was
  blind and the new one is not. This answers the round-1 security FAIL.

## Design rev 4 vs code (grep of 4.7, 4.11, U5, I8b, I7, sections 3 and 12, ADR-0007)
- 4.7 step 2 (design:447-458) and step 5 (461-462) match migrate.ts:86-107. The citations `index.js:91-99`,
  `:127` are correct (checked in the installed source). The "stages 2-4" wording at 464 still holds, now that
  construction is part of stage 2.
- 4.11 (626-633) matches the code and the U5 case. The other leak rules (634-638) are unchanged.
- 7 U5 (826) matches options.test.ts:66-84 word for word (title, URL, ENOENT, canary). The mutation is
  verified.
- 7 I8b (845) defines "the logged text" exactly as `loggedArgument` + join implements it.
- 7 I7 (843): mutation (a) is correct, and mutation (b) is exactly what the tester ran in re-test mutation 5
  (`lesson_progress_i7_unique`, `total=38 failed=1`, I9/I10 green, red at `schema.int.test.ts:145`).
- F1 (186), F21 (206), the S4/A2 traceability rows (92, 94) and ADR-0007 items 9 (126-134) say nothing that
  the change contradicts. No stale `client.end()` without `?`, and no `String(arg)` rendering, anywhere in
  the design.

## Non-blocking (doc evidence, not behaviour)
1. Three places still mark I7 mutation (b) as **[unverified, judge suggestion]** and keep the fallback
   sentence: `plans/28-db-schema-design.md:37` (rev 4 table), `:843` (7 I7), `:1502` (section 12 Evidence
   column). The tester verified (b) live after rev 4 was written (test report line 161). Rev 4's prediction
   was right, so this is not an architect error, only sequencing. Before commit, the orchestrator should
   have the architect change those three markers to "verified live in the round-1 re-test: total=38
   failed=1, I9/I10 green" and drop or demote the fallback.
2. `plans/28-db-schema-design.md:1474` still says the **[verify-live]** rows "have not been run by anyone".
   Most of them were run by the tester in round 1. This was already stale in round 1 and was not introduced
   here. Same doc pass.
3. migrate.ts:87-88 could add "or validates the libpq-compat sslmode", which would mirror design 4.7. This
   is optional.

## Regressions
No other file in `packages/db` changed this round (tester: shasum before/after; `cmp` of the four files in
C2). Worktree runs: typecheck, unit 34/34, build, integration 38/38, and lint with only the three ignored
`.claude` json files (test report 134-138). The C2 GREEN block and T-drift positive are green as well.

## Verdict
PASS - no architecture issues found
