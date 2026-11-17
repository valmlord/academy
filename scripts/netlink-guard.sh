#!/usr/bin/env bash
# Fails the e2e job when an interface address changes in the runner's network namespace while Playwright runs.
# Chromium flushes its socket pools with ERR_NETWORK_CHANGED on every RTM_NEWADDR / RTM_DELADDR on any non-loopback
# interface, link-local included, so one such event in the window can fail a navigation or a chunk load (#201).
#
#   bash scripts/netlink-guard.sh start <log> <pidfile>   start the monitor, prove it records a probe address
#   bash scripts/netlink-guard.sh check <log> <pidfile>   stop the monitor, then scan the log
#   bash scripts/netlink-guard.sh scan <log>              judge a finished log (also on a downloaded artifact)
#
# Exit codes: start 0 monitor ready, 1 probe not seen or a probe command failed; check 1 monitor missing or not
# stopped, otherwise the code of scan; scan 0 no address line, 1 address lines found, 2 the log cannot be judged
# (no probe lines, or a line that is not a monitor record, such as iproute2's "netlink receive error" when the
# kernel dropped events). Every command: 2 on wrong usage.
#
# Written for bash 3.2 (a tester's macOS, scan only) and 5.2 (CI).
set -euo pipefail

# One record per line from `ip -ts -o monitor link address`: an address record names the interface followed by
# spaces and its family, a link record follows the name with "@peer:" or ":", and a deletion puts "Deleted "
# after the timestamp. Any family counts, because Chromium filters neither by family nor by scope.
ADDRESS_LINE='^\[[^]]+\] (Deleted )?[0-9]+: [^ :@]+ +inet6? '
# lo by the guard's scope; guardprobe0 is the guard's own probe, made before the browser starts.
EXEMPT_LINE='^\[[^]]+\] (Deleted )?[0-9]+: (lo|guardprobe0) +inet'
# 192.0.2.1 is TEST-NET-1 (RFC 5737), never routed.
PROBE_ADD='^\[[^]]+\] [0-9]+: guardprobe0 +inet 192\.0\.2\.1/32 '
PROBE_DELETE='^\[[^]]+\] Deleted [0-9]+: guardprobe0 +inet 192\.0\.2\.1/32 '
# The monitor may not have subscribed yet when the first probe runs.
PROBE_ATTEMPTS=10
# 50 polls of 0.1 s: the monitor gets 5 s to exit after SIGTERM.
STOP_POLLS=50

usage() {
  echo "netlink guard: usage: netlink-guard.sh start <log> <pidfile> | check <log> <pidfile> | scan <log>"
  exit 2
}

# A probe line counts only when it also passes ADDRESS_LINE and EXEMPT_LINE, so a change in this ip's address
# format fails closed here instead of leaving ADDRESS_LINE matching nothing.
probe_seen() {
  local log=$1
  local exempt
  exempt=$(LC_ALL=C grep -E "$ADDRESS_LINE" "$log" | LC_ALL=C grep -E "$EXEMPT_LINE" || true)
  LC_ALL=C grep -Eq "$PROBE_ADD" <<<"$exempt" && LC_ALL=C grep -Eq "$PROBE_DELETE" <<<"$exempt"
}

# A guardprobe0 left by an earlier attempt would make `ip link add` fail; a missing one is the normal case.
remove_leftover_probe() {
  local out
  if out=$(sudo ip link del guardprobe0 2>&1); then return 0; fi
  case "$out" in
    *"Cannot find device"*) return 0 ;;
  esac
  echo "netlink guard: could not remove a leftover guardprobe0: $out"
  return 1
}

run_probe() {
  remove_leftover_probe &&
    sudo ip link add guardprobe0 type veth peer name guardprobe1 &&
    sudo ip addr add 192.0.2.1/32 dev guardprobe0 &&
    sudo ip addr del 192.0.2.1/32 dev guardprobe0 &&
    sudo ip link del guardprobe0
}

start() {
  local log=$1 pidfile=$2
  # Every fd redirected: a background child holding the step's stdout would keep the step from finishing.
  # stdbuf -oL, because ip block-buffers its output when it is not a terminal.
  nohup stdbuf -oL ip -ts -o monitor link address >"$log" 2>&1 </dev/null &
  local pid=$!
  echo "$pid" >"$pidfile"
  local attempt=1
  while [ "$attempt" -le "$PROBE_ATTEMPTS" ]; do
    if ! run_probe; then
      echo "netlink guard: probe attempt $attempt failed, monitor stopped"
      kill "$pid" 2>/dev/null || true
      exit 1
    fi
    if probe_seen "$log"; then
      echo "netlink guard: monitor ready, probe add and delete seen"
      exit 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  echo "netlink guard: probe lines not seen after $PROBE_ATTEMPTS attempts (buffering, subscription or ip output format changed)"
  head -n 20 "$log" || true
  kill "$pid" 2>/dev/null || true
  exit 1
}

check() {
  local log=$1 pidfile=$2
  local pid=""
  if [ -r "$pidfile" ]; then pid=$(cat "$pidfile"); fi
  # An empty or garbled value would make kill signal something else (kill 0, kill -1) or nothing.
  if ! [[ $pid =~ ^[1-9][0-9]*$ ]]; then
    echo "netlink guard: pid file $pidfile holds no pid"
    exit 1
  fi
  local comm=""
  if [ -r "/proc/$pid/comm" ]; then comm=$(cat "/proc/$pid/comm" 2>/dev/null || true); fi
  if [ -z "$comm" ] || ! kill -0 "$pid" 2>/dev/null; then
    echo "netlink guard: monitor not running at the end of the window"
    exit 1
  fi
  # The pid may have been reused by another process after the monitor died; that one is never signalled.
  if [ "$comm" != "ip" ]; then
    echo "netlink guard: pid $pid from $pidfile is '$comm', not the ip monitor; nothing killed"
    exit 1
  fi
  kill "$pid"
  local poll=0
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$poll" -ge "$STOP_POLLS" ]; then
      # A log that may still be written to is not evidence, so no SIGKILL-and-scan.
      echo "netlink guard: monitor $pid still running 5 s after SIGTERM, log not scanned"
      exit 1
    fi
    sleep 0.1
    poll=$((poll + 1))
  done
  scan "$log"
}

scan() {
  local log=$1
  if [ ! -r "$log" ]; then
    echo "netlink guard: cannot read $log"
    exit 2
  fi
  if ! probe_seen "$log"; then
    echo "netlink guard: no probe lines in $log"
    exit 2
  fi
  local foreign
  foreign=$(LC_ALL=C grep -Ev '^(\[.*)?$' "$log" || true)
  if [ -n "$foreign" ]; then
    echo "netlink guard: $log holds lines that are not monitor records (events may have been dropped), window not judged"
    printf '%s\n' "$foreign"
    exit 2
  fi
  local offending
  offending=$(LC_ALL=C grep -E "$ADDRESS_LINE" "$log" | LC_ALL=C grep -Ev "$EXEMPT_LINE" || true)
  if [ -n "$offending" ]; then
    local count
    count=$(LC_ALL=C grep -c '' <<<"$offending")
    echo "netlink guard: $count address lines while the Playwright steps ran (pnpm test:e2e to service-down); Chromium flushes its socket pools on each; see scripts/netlink-guard.sh header, #201"
    printf '%s\n' "$offending"
    exit 1
  fi
  local links
  links=$(LC_ALL=C grep -E '^\[' "$log" | LC_ALL=C grep -Evc "$ADDRESS_LINE" || true)
  echo "netlink guard: 0 address lines while the Playwright steps ran; $links link lines"
  exit 0
}

case "${1-}" in
  start)
    [ "$#" -eq 3 ] || usage
    start "$2" "$3"
    ;;
  check)
    [ "$#" -eq 3 ] || usage
    check "$2" "$3"
    ;;
  scan)
    [ "$#" -eq 2 ] || usage
    scan "$2"
    ;;
  *) usage ;;
esac
