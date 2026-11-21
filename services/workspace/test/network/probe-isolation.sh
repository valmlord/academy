#!/usr/bin/env bash
# Network probe (design 12.4, ADR-0002 item 6): what a workspace container reaches, per target and path.
#   probe-isolation.sh <project> <instance> --rows all|c2 [--assume-platform linux]
# Never runs compose up or down. Uses only `docker compose -p <project> exec`, `docker inspect` with an explicit
# format, `docker info`, `docker exec` into its own probe workspace, and `docker run`/`rm` of its own helper.
# Project academy (the owner's stack) is refused unless CI=true: a guardrail against a typo, not a control.
# Host ports come from DB_PORT and WEB_PORT (defaults 5432 and 3080, the owner's values).
# Output: one `NP <row> OK|FAIL|SKIP ...` line per target; exit 1 on any FAIL, 2 on a usage error.
set -uo pipefail

usage() {
  echo "usage: probe-isolation.sh <project> <instance> --rows all|c2 [--assume-platform linux]" >&2
  exit 2
}

[ $# -ge 4 ] || usage
project=$1
instance=$2
shift 2
rows=""
assume=""
while [ $# -gt 0 ]; do
  case $1 in
    --rows) [ $# -ge 2 ] || usage; rows=$2; shift 2 ;;
    --assume-platform) [ $# -ge 2 ] || usage; assume=$2; shift 2 ;;
    *) usage ;;
  esac
done
case $rows in all | c2) ;; *) usage ;; esac
# Only linux: it can make the probe stricter, never turn the Desktop lenient branch on.
case $assume in "" | linux) ;; *) usage ;; esac
[[ $project =~ ^[a-z0-9][a-z0-9_-]*$ ]] || usage
[[ $instance =~ ^[a-z0-9][a-z0-9-]{0,15}$ ]] || usage
if [ "$project" = academy ] && [ "${CI:-}" != true ]; then
  echo "NP refused: project academy is probed only in CI (CI=true)" >&2
  exit 2
fi

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)" || exit 2

readonly PROBE_IMAGE=node:22.23.4-alpine
readonly PROBE_USER=probeuser
readonly SERVICE_PORT=4100
readonly WEB_CONTAINER_PORT=3000
readonly DB_CONTAINER_PORT=5432
readonly HELPER_PORT=8080
readonly API=services/workspace/test/network/api.mjs
db_port=${DB_PORT:-5432}
web_port=${WEB_PORT:-3080}
network="wks-$instance-net"
helper_name="probe-helper-$project-$instance"
run_label="academy.workspace.test-run=probe-$(date +%s)"
failures=0
ensure_attempted=""
workspace=""
helper_id=""

# Connects with a 3 s timeout and prints REACHABLE, UNREACHABLE (<code>) or UNRESOLVED (the name lookup failed).
readonly TCP_JS='const [host, port] = process.argv.slice(1);
const socket = require("node:net").connect({ host, port: Number(port) });
const timer = setTimeout(() => { console.log("UNREACHABLE (TIMEOUT)"); process.exit(0); }, 3000);
socket.on("connect", () => { console.log("REACHABLE"); process.exit(0); });
socket.on("error", (error) => {
  clearTimeout(timer);
  const unresolved = error.code === "ENOTFOUND" || error.code === "EAI_AGAIN";
  console.log(unresolved ? "UNRESOLVED" : `UNREACHABLE (${error.code})`);
  process.exit(0);
});'
readonly RESOLVE_JS='require("node:dns").lookup("host.docker.internal", (error, address) => {
  process.stdout.write(error ? "UNRESOLVED" : address);
});'
readonly EGRESS_JS='fetch("https://api.anthropic.com", { signal: AbortSignal.timeout(10000) })
  .then((response) => console.log(`REACHABLE (status ${response.status})`))
  .catch((error) => console.log(`UNREACHABLE (${error.cause?.code ?? error.name})`));'
readonly HEALTH_JS='fetch("http://workspace:4100/healthz", { signal: AbortSignal.timeout(5000) })
  .then((response) => console.log(response.status))
  .catch((error) => console.log(error.cause?.code ?? error.name));'

ok() { echo "NP $1 OK $2"; }
fail() {
  echo "NP $1 FAIL $2"
  failures=$((failures + 1))
}

compose_exec() { docker compose -p "$project" exec -T "$@"; }
tcp() { docker exec "$workspace" node -e "$TCP_JS" "$1" "$2" 2>/dev/null; }
# The IPv4 address of a container on one network, or nothing.
ip_on() { docker inspect --format "{{with index .NetworkSettings.Networks \"$2\"}}{{.IPAddress}}{{end}}" "$1"; }

# expect_unreachable <row> <host> <port>: UNRESOLVED counts as unreachable only off Docker Desktop, where the
# name may legitimately not exist; on Desktop it always exists, so UNRESOLVED there means the row proved nothing.
expect_unreachable() {
  local out
  out=$(tcp "$2" "$3")
  case $out in
    "UNREACHABLE "*) ok "$1" "$2:$3 $out" ;;
    UNRESOLVED)
      if [ -n "$desktop" ]; then fail "$1" "$2:$3 UNRESOLVED (row vacuous on Docker Desktop)"; else ok "$1" "$2:$3 UNRESOLVED"; fi ;;
    REACHABLE) fail "$1" "$2:$3 REACHABLE" ;;
    *) fail "$1" "$2:$3 probe error (${out:-no output})" ;;
  esac
}

expect_reachable() {
  local out
  out=$(tcp "$2" "$3")
  if [ "$out" = REACHABLE ]; then ok "$1" "$2:$3 REACHABLE"; else fail "$1" "$2:$3 ${out:-probe error}"; fi
}

# An address row whose name did not resolve: skipped off Desktop, a failure on Desktop.
expect_unreachable_address() {
  if [ "$2" != UNRESOLVED ]; then
    expect_unreachable "$1" "$2" "$3"
  elif [ -n "$desktop" ]; then
    fail "$1" "host.docker.internal did not resolve (row vacuous on Docker Desktop)"
  else
    echo "NP $1 SKIP (unresolved)"
  fi
}

# record_residual <row> <host> <port> <out>: a row whose target is an accepted residual of ADR-0002 item 6
# records what it observed. Both answers pass; UNRESOLVED or no answer means the probe proved nothing, a FAIL.
record_residual() {
  case $4 in
    REACHABLE) ok "$1" "(observed REACHABLE: accepted residual, ADR-0002 item 6) $2:$3" ;;
    "UNREACHABLE "*) ok "$1" "(observed UNREACHABLE) $2:$3 $4" ;;
    *) fail "$1" "$2:$3 ${4:-probe error}" ;;
  esac
}

# W2a/W2b: on Docker Desktop the host name forwards to the Mac's loopback, where web is published for the
# browser; reaching it is the accepted residual of ADR-0002 item 6. Off Desktop it must not be reachable.
expect_web_via_host() {
  local out
  if [ "$2" = UNRESOLVED ]; then
    out=UNRESOLVED
  else
    out=$(tcp "$2" "$3")
  fi
  if [ -n "$desktop" ]; then
    record_residual "$1" "$2" "$3" "$out"
  else
    case $out in
      REACHABLE) fail "$1" "$2:$3 REACHABLE" ;;
      "UNREACHABLE "* | UNRESOLVED) ok "$1" "$2:$3 $out" ;;
      *) fail "$1" "$2:$3 probe error (${out:-no output})" ;;
    esac
  fi
}

teardown() {
  if [ -n "$ensure_attempted" ]; then
    compose_exec workspace node --input-type=module - delete "$PROBE_USER" <"$API" ||
      fail teardown "delete of the probe workspace of $PROBE_USER"
  fi
  # By the Id its own create returned: a container of that name this run did not create is never touched.
  if [ -n "$helper_id" ]; then
    docker rm -f "$helper_id" >/dev/null || fail teardown "remove of helper $helper_name"
  fi
}

finish() {
  local rc=$?
  teardown
  if [ "$rc" -ne 0 ] || [ "$failures" -gt 0 ]; then
    echo "NP result FAIL (failures=$failures, rc=$rc)"
    exit 1
  fi
  echo "NP result OK"
  exit 0
}
trap finish EXIT

# 1. Platform.
os=$(docker info --format '{{.OperatingSystem}}') || { echo "NP setup FAIL docker info"; exit 1; }
desktop=""
[ "$os" = "Docker Desktop" ] && desktop=1
echo "NP platform $os"
if [ "$assume" = linux ]; then
  desktop=""
  echo "NP platform assumed=linux"
fi

# 2. The probe workspace, through the API.
ensure_attempted=1
workspace=$(compose_exec workspace node --input-type=module - ensure "$PROBE_USER" <"$API") ||
  { echo "NP setup FAIL ensure of the probe workspace"; exit 1; }
[[ $workspace =~ ^wks-[a-z0-9-]+$ ]] || { echo "NP setup FAIL unexpected container name"; exit 1; }
echo "NP setup workspace $workspace"

# 3. Addresses, collected on the host side.
gateway=$(docker inspect --format "{{with index .NetworkSettings.Networks \"$network\"}}{{.Gateway}}{{end}}" "$workspace")
hdi_ip=$(docker exec "$workspace" node -e "$RESOLVE_JS")
[ -n "$gateway" ] && [ -n "$hdi_ip" ] || { echo "NP setup FAIL gateway or host name lookup"; exit 1; }
echo "NP setup gateway $gateway host.docker.internal=$hdi_ip"

# C1: a helper on the workspace network must be reachable, or the probe itself is broken.
# A client close ending in a RST is an ECONNRESET on the accepted socket; without a handler node
# exits and the helper frees its IP (#143, the same defect #129 fixed in runtime-stop.int.test.ts).
helper_id=$(docker run -d --pull never --name "$helper_name" --network "$network" --label "$run_label" \
  "$PROBE_IMAGE" node -e "require('node:net').createServer((s) => { s.on('error', (e) => console.error('listener socket error ' + e.code)); s.end(); }).listen($HELPER_PORT)") ||
  { helper_id=""; echo "NP C1 FAIL helper not started"; exit 1; }
helper_ip=$(ip_on "$helper_id" "$network")
c1=""
for _ in 1 2 3 4 5; do
  c1=$(tcp "$helper_ip" "$HELPER_PORT")
  [ "$c1" = REACHABLE ] && break
  sleep 1
done
if [ "$c1" != REACHABLE ]; then
  echo "NP C1 FAIL $helper_ip:$HELPER_PORT ${c1:-probe error} (the probe is broken)"
  exit 1
fi
ok C1 "$helper_ip:$HELPER_PORT REACHABLE"

if [ "$rows" = c2 ]; then
  # Positive control for the D rows: with compose.db-port.yaml the db port is on the Mac's loopback.
  expect_reachable C2 host.docker.internal "$db_port"
  exit 0
fi

service_ip=$(ip_on "$project-workspace-1" "${project}_workspace-api")
db_ips=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$project-db-1")
web_ips=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$project-web-1")
[ -n "$service_ip" ] && [ -n "${db_ips// /}" ] && [ -n "${web_ips// /}" ] ||
  { echo "NP setup FAIL service, db or web address"; exit 1; }
# D2 is strict only while db publishes nothing: the residual below is about published ports, so it is keyed on
# db's own publish state, not on the platform.
db_published=$(docker inspect --format "{{range (index .HostConfig.PortBindings \"$DB_CONTAINER_PORT/tcp\")}}{{if .HostPort}}{{.HostPort}}{{else}}auto{{end}} {{end}}" "$project-db-1") ||
  { echo "NP setup FAIL db port bindings"; exit 1; }
db_published=${db_published% }
echo "NP setup db published=${db_published:-none}"

expect_unreachable D1 host.docker.internal "$db_port"
expect_unreachable_address D1 "$hdi_ip" "$db_port"
for ip in $db_ips; do
  if [ -n "$db_published" ]; then
    # Same residual as W1 below (ADR-0002 item 6 residual 5, #88): a published db port is reachable by
    # container IP from other bridges on Docker Desktop 29.9.2, so while published D2 records.
    record_residual D2 "$ip" "$DB_CONTAINER_PORT" "$(tcp "$ip" "$DB_CONTAINER_PORT")"
  else
    expect_unreachable D2 "$ip" "$DB_CONTAINER_PORT"
  fi
done
expect_unreachable D3 "$gateway" "$db_port"
expect_unreachable S1 "$service_ip" "$SERVICE_PORT"
expect_unreachable S2 "$gateway" "$SERVICE_PORT"
expect_unreachable S3 host.docker.internal "$SERVICE_PORT"
expect_unreachable_address S4 "$hdi_ip" "$SERVICE_PORT"
# W1 records on every platform: Docker Desktop 29.9.2 routes a host-published port to the container IP from
# any bridge, even for a 127.0.0.1 publish, and web is always published for the browser (ADR-0002 item 6
# residual 5, until the egress filter of #88, and after it for workspaces created before it unless #88 re-creates
# existing ones). Linux behaviour is unknown, so there is no platform branch.
for ip in $web_ips; do record_residual W1 "$ip" "$WEB_CONTAINER_PORT" "$(tcp "$ip" "$WEB_CONTAINER_PORT")"; done
expect_web_via_host W2a host.docker.internal "$web_port"
expect_web_via_host W2b "$hdi_ip" "$web_port"
expect_unreachable W2c "$gateway" "$web_port"

# E1 depends on an external host, so only this row is retried once.
egress=$(docker exec "$workspace" node -e "$EGRESS_JS")
if [[ $egress != REACHABLE* ]]; then
  sleep 5
  egress=$(docker exec "$workspace" node -e "$EGRESS_JS")
fi
if [[ $egress == REACHABLE* ]]; then ok E1 "api.anthropic.com $egress"; else fail E1 "api.anthropic.com ${egress:-probe error}"; fi

health=$(compose_exec web node -e "$HEALTH_JS")
if [ "$health" = 200 ]; then ok A1 "web -> workspace:$SERVICE_PORT/healthz 200"; else fail A1 "web -> workspace:$SERVICE_PORT/healthz ${health:-no answer}"; fi
