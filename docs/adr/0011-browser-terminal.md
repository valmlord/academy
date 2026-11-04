# ADR-0011: Browser terminal

- Status: Proposed
- Date: 2026-11-04
- Issue: #32

## Context
The lesson page needs a terminal in the lesson's workspace container (ADR-0002: `docker exec` with a TTY over a
WebSocket). Facts, with sources:
- The browser reaches only web's published port; the workspace service has no host port and sits on the internal
  network `workspace-api` (ADR-0002 item 6, ADR-0010 item 1). ADR-0007 item 8 requires that the stream the browser
  sees ends in, or is relayed by, `apps/web`.
- Next.js 16.4.3 route handlers cannot accept a WebSocket upgrade; its router ends the socket of any upgrade that
  matches an app route, and the app has a catch-all route. A custom server that hands Next its own listening server
  gets the same socket ending, because Next attaches its upgrade listener to that server on the first request.
- The custom server runs outside the bundle: only packages Next's tracing copies into the standalone tree exist
  there (`next` does, `zod` does not), and `next` is CommonJS whose export is the factory function. Node removes its
  socket error handler before emitting `upgrade`, and Next's own server wraps upgrades in try/catch.
- Docker cannot re-attach to a running exec (409 "already running"), and closing the attach connection of a TTY exec
  does not stop its process (observed on Docker Desktop 29.9.2, linux/arm64).
- xterm's `reset()` neither clears queued writes nor resets the parser; RIS written in band does both, in order.
- One terminal session per lesson; a new browser tab takes it over (Stepan, 2026-11-04).
- ADR-0008 items 5 and 10 and ADR-0007 item 6 promise that sign-out, a password re-key and account deletion revoke
  sessions; a connection authorized once would outlive them.
- `fastify@5.12.7` with GHSA-3qgw-9275-xf8w (ADR-0003 amendment #31).

## Decision
1. **Path.** The browser opens `ws://<host>/api/terminal/socket?ticket=<ticket>` on web's port. Web's custom server
   (`apps/web/server/main.ts`) relays that upgrade byte for byte to `GET W/terminal` of the workspace service
   (ADR-0010 item 13) with the Bearer secret. Next never sees it.
2. **Custom server.** `next({ dev: false, dir, hostname, port, httpServer })` where `httpServer` is a second,
   never-listening `http.Server`: every upgrade that is not the terminal path is emitted there for Next, or destroyed
   while Next has not attached its listener. The Next configuration comes from `.next/required-server-files.json`
   through `__NEXT_PRIVATE_STANDALONE_CONFIG`, as Next's generated standalone `server.js` does; `output: "standalone"`
   stays. Its modules import only `node:*` and, through `createRequire(import.meta.url)("next")` narrowed at runtime,
   `next`. It is compiled with `tsc` to `apps/web/dist/server`; the image runs `node apps/web/server/main.js`. It
   handles SIGTERM and SIGINT with an 8 s hard limit and exits 1 on a server error. `pnpm dev` stays `next dev` and has
   no terminal. Every Next upgrade re-runs the e2e terminal tests and the standalone import check before it merges.
3. **Ticket, deadline, containment.** Minted by the server action `openTerminal` after the session read (ADR-0008
   item 8), the lesson check and a running workspace: `base64url(payload) "." base64url(HMAC-SHA256)`, payload
   `{ v: 1, u, c, l, exp, dl, n }` (user from the session, course, lesson, expiry 30 s, the connection deadline
   `dl = min(session expiry, mint + TERMINAL_RELAY_MAX_SECONDS)`, a 128-bit nonce), key
   `HKDF-SHA256(BETTER_AUTH_SECRET, salt "", info "academy terminal ticket v1", 32 bytes)`; the action also returns
   `renewInMs`, the delay after which the browser renews, or null when the deadline is within the renewal margin.
   The relay checks the token against a fixed ASCII pattern with an exact 43-character MAC before any decode or
   compare, accepts a ticket once per process, only with a loopback `Host` (`localhost`, `127.0.0.1`, `[::1]`, any
   port) and an `Origin` of exactly `http://<Host>`, builds the upstream path from the payload alone, forwards only
   `Upgrade`, `Connection`, `Sec-WebSocket-Key`, `Sec-WebSocket-Version` plus its own `Authorization` and a random
   connection id, and cuts the connection at `min(dl, connect + TERMINAL_RELAY_MAX_SECONDS)` (default 900 s,
   120-3600). Every raw socket gets an error listener before anything else and keeps one until it is gone, and every
   upgrade path runs inside a catch, so no malformed request or reset can stop the server; refusal and containment
   logs are rate-limited per reason and never carry an error object.
4. **Session.** The workspace service holds at most one session per workspace: a TTY exec (`Cmd [TERMINAL_SHELL,
   "-l"]`, `User 1000:1000`, `WorkingDir /workspace/home/work`, `Env TERM=xterm-256color, LANG=C.UTF-8`) and a
   headless xterm (`allowProposedApi`) with `TERMINAL_SCROLLBACK_LINES` of scrollback, never reset, at most one
   attached and one attaching socket. It outlives the browser and ends on shell exit, container stop and service
   shutdown, always through one idempotent teardown. Every promise or callback started from a socket, stream or timer
   listener has a stated failure action; a failed resize is ignored. A service restart ends every session; the
   shells of sessions that ended this way keep running without a terminal until the container stops; files stay.
5. **Reconnect, renewal and takeover.** A connection attaches to the live session or creates one; the newest
   connection wins and every older attached or attaching socket is closed with 4001; only the current sockets'
   events change the session. An attach flushes the headless parser and sends the serialized screen before live
   output; the browser clears its screen with an in-band RIS (never a synchronous reset), writes the snapshot, and
   answers with its terminal size. The browser renews its connection `renewInMs` after the ticket with a fresh
   `openTerminal`, switches to the new socket at its `attached` and ignores the old socket's 4001; acknowledgements
   count only binary bytes and belong to the socket whose bytes they count; results of requests that a newer state or
   an unmount has superseded are dropped; a renewal answered `unauthenticated` ends in the session-expired state;
   renewal timers end with the running state. After a drop it retries `TERMINAL_RECONNECT_ATTEMPTS` times with
   backoff, never after 4000, 4001 or 4002 on the current socket, and drops input typed while disconnected.
6. **Protocol** (inside `/v1`, additive changes only). Client to service, JSON text frames of at most 64 KiB:
   `{"t":"input","d":<string, 1..8192 UTF-16 units>}`, `{"t":"resize","cols":<2..500>,"rows":<1..200>}`,
   `{"t":"ack","n":<1..16777216, binary bytes processed since the previous ack on this socket>}`. Service to client: the
   first frame is `{"t":"attached","resumed":<boolean>}`; a resumed attach then sends `{"t":"snapshot","d":<string>}`;
   output is binary frames of raw terminal bytes. Close codes and reasons: 4000 `exit <n>` or `exit unknown` (shell
   exited), 4001 `taken over`, 4002 `environment stopped`, 1001 `service shutting down`, 1003 (binary frame from the
   client), 1008 `invalid message` or `ack exceeds sent`, 1009 (message too big), 1011 `terminal error`.
7. **Flow control.** The service pauses the exec stream during an attach flush and while more than 1 MiB of sent
   output is unacknowledged, more than 1 MiB is buffered on the socket, or more than 1 MiB waits for the headless
   parser, and resumes when all are clear (at or below 256 KiB); the acknowledgement and buffer gates reset when the
   client leaves. Input pauses the WebSocket while the exec stream does not drain.
8. **Activity.** The service moves the idle window on input and resize, and on output only while a browser is
   attached (ADR-0010 item 9 amended).
9. **Lesson started.** The first key or paste the learner makes in the terminal on a page makes the browser call
   the server action `recordLessonStarted`, which upserts `enrollments` and an `in-progress` `lesson_progress` row
   (ADR-0007 item 5 amended).
10. **Limits.** One session per workspace, no other cap; scrollback 100-10000 lines (default 1000); heartbeat ping
    every 30 s, a client that misses one is terminated.
11. **Logging.** Never terminal bytes, the ticket, request URLs with a ticket, headers, error objects or the secret;
    the relay logs a reason code and the connection id, the service the workspace id, close code and connection id.
12. **Independence.** Web does not wait for the workspace service at startup and serves every page without it; an
    unreachable service is the Terminal tab's "start failed" state (ADR-0010 item 10 amended).

## Alternatives considered
- Next rewrites to the service: no header, no session check, exposes the service, 30 s proxy timeout.
- A relay process or container: a second DB client (ADR-0007 item 8) or a second auth path, one more process.
- Dropping standalone output for a classic custom server: loses the traced image and its course-leak checks.
- Session in web: dies with every web restart; the web-to-service link would need its own reconnect.
- tmux/dtach in the container: needs the image (#33); revisit there, it would survive a service restart.
- Raw byte replay: breaks full-screen programs. Session cookie on the upgrade: the custom server would need its own
  Better Auth and pool. A dedicated ticket secret: one more required secret.
- Keeping a connection until the session's expiry: a revoked session's terminal would live up to 7 days.
- A periodic DB check in the relay: a second auth path; the renewal reuses the DAL.
- Web `depends_on` the service being healthy: a broken service would take the whole site down (Stepan, D5).

## Consequences
- The lesson page starts the environment on open (F8, decision A10) and every lesson e2e test creates a workspace;
  specs that type into a terminal run only with `E2E_TERMINAL=1`, in a Playwright project scheduled after all others.
- Revocation reaches an open terminal within `TERMINAL_RELAY_MAX_SECONDS` (15 minutes by default); the learner sees
  nothing of the renewal but a redraw of the same screen.
- If another tab connects within the second a renewal takes, the newer tab can end up taken over; one click on
  "Открыть здесь" recovers.
- The used-ticket set lives in one web process: after a web restart a ticket minted in the last 30 s can be used once
  more by whoever holds it.
- A Next upgrade must re-verify the custom server (required-server-files.json, the `httpServer` option, the `next`
  export).
- The `ws` override in `pnpm-workspace.yaml` is removed with the fastify 5.12.8 bump.
- Accepted residual (Stepan, 2026-11-04): a shell whose session ends while the shell is still running (service
  restart, an end with code 1011, a failure after the exec started) keeps running inside the container, without a
  terminal and with its children, until the container stops (idle stop or restart). It counts against the container's
  memory and pids limits and can hold files or ports open. An integration test asserts this behaviour so a change in
  Docker is noticed; an explicit kill of the shell's process group is a follow-up.
