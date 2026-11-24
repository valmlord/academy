# Command check exit codes
How a `command` check's grader script ends decides its result (ADR-0007 rule 3, ADR-0001 item 8):
- `0`: passed.
- `3`: a format error or a stage-0 rejection. Never counted toward `attempts.limit`.
- Any other end after the grader has started is a counted failure: any other exit code, a signal,
  the `timeoutSec` kill (stored as `timeout`), the container stopping, and a grader or platform
  fault (ADR-0007 decision D11).
- The exceptions are uncounted `error` results: any failure before the grader started, and a stop
  the platform issued and recorded (the workspace service's own stop, web's startup sweep).

A script exits 3 for every rejection the task text calls uncounted, and only for those. The
rejection is decided before any comparison with the key or hidden tests, and until the check's
first pass the message must show nothing derived from them. Graders run learner code as child
processes and never pass a child's exit code through as their own.
