#!/usr/bin/env python3
"""Locked transactions on one checkout's pipeline state; pipeline-advance.sh is the only caller
besides the tests.

Every op runs its whole read-modify-write under an exclusive flock and replaces the state file
atomically, so concurrent hooks never lose an update and the gates' unlocked reads never see a
torn file.

  state.py init <root> <tier> <issue> <branch> <gitdir> <code_root>
  state.py advance <root> <expected_current> <next>
  state.py vote <root> <round> <judge> <verdict> [agent_id] [path]
  state.py record_spawn <root> <round> <agent_id> <judge>
  state.py set_artifact <root> <key> <value>
  state.py finish <root>

Exit codes: 0 done (one result line on stdout), 1 refused, 3 the state changed under the caller,
75 the lock was not acquired in time. Errors go to stderr; nothing is written on any error.
"""
import contextlib
import fcntl
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.realpath(__file__))
sys.path.append(HERE)
import cfg  # noqa: E402
import checkout  # noqa: E402

EXIT_REFUSED = 1
EXIT_CONFLICT = 3
# EX_TEMPFAIL from sysexits.h: nothing happened, the caller may retry.
EXIT_LOCK_TIMEOUT = 75
LOCK_POLL_SECONDS = 0.05
# Same value as pipeline.json state_lock_timeout_seconds; used only when that key is absent.
DEFAULT_LOCK_TIMEOUT_SECONDS = 5
SECONDS_PER_HOUR = 3600
# A new name, not v1's pipeline_state.json.lock: v1 treats an existing .json.lock as held and
# waits on it, and this lock file is never deleted.
LOCK_NAME = "pipeline_state.flock"
STATE_NAME = "pipeline_state.json"


class Refused(Exception):
    code = EXIT_REFUSED


class Conflict(Refused):
    code = EXIT_CONFLICT


class StateLockTimeout(Exception):
    pass


def _claude_dir(root):
    return os.path.join(root, ".claude")


def state_path(root):
    return os.path.join(_claude_dir(root), STATE_NAME)


def _lock_timeout():
    value = cfg.load().get("state_lock_timeout_seconds", DEFAULT_LOCK_TIMEOUT_SECONDS)
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0 else DEFAULT_LOCK_TIMEOUT_SECONDS


@contextlib.contextmanager
def transaction(root):
    """Hold the checkout's state lock. flock is released by the kernel when its holder dies, so a
    lock that is still held belongs to a live process and is never broken."""
    lock = os.path.join(_claude_dir(root), LOCK_NAME)
    timeout = _lock_timeout()
    fd = os.open(lock, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        deadline = time.monotonic() + timeout
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise StateLockTimeout("could not lock %s within %ss; nothing written" % (lock, timeout))
                time.sleep(LOCK_POLL_SECONDS)
        yield
    finally:
        os.close(fd)


def _test_delay():
    """PIPELINE_STATE_TEST_DELAY_MS widens the read-to-write window for the concurrency tests; it can
    only slow a write down, never change one."""
    delay_ms = os.environ.get("PIPELINE_STATE_TEST_DELAY_MS", "")
    if delay_ms.isdigit():
        time.sleep(int(delay_ms) / 1000.0)


def load(root):
    """The state dict, or None when there is none. An unreadable state refuses every op, because
    no op may overwrite or move a state it cannot read."""
    status, data = checkout.read_state(root)
    if status == "unreadable":
        raise Refused("state file unreadable: %s; nothing written" % state_path(root))
    return data


def save(root, data):
    tmp = os.path.join(_claude_dir(root), "pipeline_state.tmp.%d" % os.getpid())
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
    os.replace(tmp, state_path(root))


def _stamp():
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def append_history(data, phase):
    data.setdefault("phase_history", []).append({"phase": phase, "ts": time.time(), "ts_str": _stamp()})
    data.setdefault("artifacts", {})["last_ts"] = _stamp()


def last_activity(data):
    """Latest phase_history timestamp: TTL and watchdog age measure inactivity, not task length."""
    latest = data.get("session_ts", 0) or 0
    for entry in data.get("phase_history", []):
        if isinstance(entry, dict) and isinstance(entry.get("ts"), (int, float)) and entry["ts"] > latest:
            latest = entry["ts"]
    return latest


def _require(data):
    if data is None:
        raise Refused("no pipeline state. Run: pipeline-advance.sh init <TIER> <issue>")
    return data


def op_init(root, tier, issue, branch, gitdir, code_root):
    with transaction(root):
        data = load(root)
        if data is not None and data.get("phase") != "done":
            ttl_hours = cfg.load()["state_ttl_hours"]
            idle = int(time.time() - last_activity(data))
            if idle < ttl_hours * SECONDS_PER_HOUR:
                raise Refused("a pipeline is still active (phase=%s, last activity %ss ago). Finish it, or wait for TTL %sh."
                              % (data.get("phase"), idle, ttl_hours))
            print("WARNING: replacing a stale state (last activity %ss ago)." % idle, file=sys.stderr)
        _test_delay()
        now = time.time()
        save(root, {
            "tier": tier, "phase": "init", "issue": int(issue) if issue else None,
            "branch_at_init": branch, "session_ts": now,
            "phase_history": [{"phase": "init", "ts": now, "ts_str": _stamp()}],
            "artifacts": {"last_ts": _stamp()},
        })
    checkout.log_event(event="init", hook="state.py", checkout=root, issue=issue)
    return "initialized"


def op_advance(root, expected, nxt):
    with transaction(root):
        data = _require(load(root))
        if data.get("phase") != expected:
            raise Conflict("state changed concurrently (now %s)" % data.get("phase"))
        _test_delay()
        data["phase"] = nxt
        append_history(data, nxt)
        save(root, data)
    checkout.log_event(event="advance", hook="state.py", checkout=root, reason=nxt)
    return "advanced to %s" % nxt


def op_vote(root, rnd, judge, verdict, agent_id="", path=""):
    with transaction(root):
        data = _require(load(root))
        if data.get("phase") != rnd:
            raise Conflict("not in round %s (now %s)" % (rnd, data.get("phase")))
        votes = data.setdefault("artifacts", {}).setdefault("judge_votes", [])
        # The handback and SubagentStop paths both report the same agent: one vote per agent and round.
        if agent_id and any(v.get("agent_id") == agent_id and v.get("round") == rnd for v in votes):
            return "vote-dup"
        _test_delay()
        votes.append({
            "agent": judge, "verdict": verdict, "round": rnd, "agent_id": agent_id, "path": path,
            "source": "hook", "ts": _stamp(),
        })
        append_history(data, "judge:%s:%s" % (judge, verdict))
        save(root, data)
    return "vote-recorded"


def op_record_spawn(root, rnd, agent_id, judge):
    with transaction(root):
        data = _require(load(root))
        phase = data.get("phase", "")
        if phase != rnd or not phase.startswith("judge_"):
            raise Conflict("not in a judge phase (now %s)" % phase)
        _test_delay()
        data.setdefault("artifacts", {}).setdefault("judge_spawns", {})[agent_id] = judge
        save(root, data)
    return "spawn-recorded"


def op_set_artifact(root, key, value):
    with transaction(root):
        data = _require(load(root))
        _test_delay()
        data.setdefault("artifacts", {})[key] = value
        save(root, data)
    return "artifact %s set" % key


def op_finish(root):
    with transaction(root):
        data = load(root)
        if data is None:
            return "nothing to finish"
        if data.get("phase") != "done":
            raise Refused("phase is %s, not done; state kept" % data.get("phase"))
        os.remove(state_path(root))
    checkout.log_event(event="finish", hook="state.py", checkout=root)
    return "finished"


OPS = {
    "init": (op_init, 6, 6),
    "advance": (op_advance, 3, 3),
    "vote": (op_vote, 4, 6),
    "record_spawn": (op_record_spawn, 4, 4),
    "set_artifact": (op_set_artifact, 3, 3),
    "finish": (op_finish, 1, 1),
}


def main(argv):
    if len(argv) < 2 or argv[1] not in OPS:
        print(__doc__, file=sys.stderr)
        return EXIT_REFUSED
    fn, least, most = OPS[argv[1]]
    args = argv[2:]
    if not least <= len(args) <= most:
        print("ERROR: state.py %s takes %d-%d arguments, got %d" % (argv[1], least, most, len(args)), file=sys.stderr)
        return EXIT_REFUSED
    try:
        print(fn(*args))
    except StateLockTimeout as exc:
        checkout.log_event(event="lock-timeout", hook="state.py", checkout=args[0], reason=argv[1])
        print("ERROR: %s" % exc, file=sys.stderr)
        return EXIT_LOCK_TIMEOUT
    except Refused as exc:
        print("ERROR: %s" % exc, file=sys.stderr)
        return exc.code
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
