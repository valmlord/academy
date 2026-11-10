#!/usr/bin/env bash
# Smoke test of a workspace image under the service's own create flags (ADR-0002 item 10, design #33 section 5).
#
#   bash images/workspace/test/smoke.sh <image> [--key-test]
#
# Every row is one docker exec (or one host-side docker call) per checked fact, decided here in bash from its exact
# exit code and output; a command inside the container never decides for more than one fact. The run is OK only
# when no row failed and the number of rows that passed is the fixed constant below, so a skipped row is a FAIL.
# --key-test runs only the rows proving that claude reads ANTHROPIC_API_KEY from its environment (fake key, no
# spend); it needs the default bridge network.
#
# Written for bash 3.2 (macOS) and 5.2 (CI). docker is called by name only. The in-container PATH strings of S4,
# S6, S8, K-env and S15 each stay on one line, exactly as design 5.2 prints them (4.1 interface line): the guard
# harness allows only those exact strings, and a wrapped one fails it.
set -euo pipefail

# K0's "no key" holds by construction, whatever the caller exported.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN

# One per expect/expect_all call: SETUP 1 + S1 1 + S2 8 + S3 2 + S4 4 + S5 14 + S6 3 + S7 11 + S8 2 + S9 1 +
# S10 4 + S11 1 + S12 5 + S13 11 + S14 2 + S15 3 + S16 1 + S17 6 + S18 2.
SMOKE_CHECKS_EXPECTED=82
# SETUP, K-env, K0, K1, K1-diff.
SMOKE_KEY_CHECKS_EXPECTED=5

usage() {
  echo "smoke: usage: smoke.sh academy-workspace:<tag> [--key-test]; got: $*" >&2
  exit 2
}
if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  usage "$@"
fi
image=$1
key_test=no
if [ "$#" -eq 2 ]; then
  if [ "$2" != --key-test ]; then
    usage "$@"
  fi
  key_test=yes
fi
if ! [[ $image =~ ^academy-workspace:[a-z0-9][a-z0-9._-]{0,127}$ ]]; then
  usage "$@"
fi

run=$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')
if ! [[ $run =~ ^[0-9a-f]{8}$ ]]; then
  echo "smoke: could not make a run id (got '${run}')" >&2
  exit 1
fi
# The README sweep finds this label; the integration sweep ignores it (its run pattern is 8 hex digits only).
run_label="academy.workspace.test-run=smoke-${run}"
volume="academy-smoke-${run}-files"
volume_created=no
id=''
kid=''
errfile=$(mktemp)

cleanup() {
  local container
  for container in "$id" "$kid"; do
    if [ -n "$container" ] && ! docker rm -f "$container" >/dev/null; then
      echo "smoke: WARNING could not remove container ${container} (label ${run_label})" >&2
    fi
  done
  if [ "$volume_created" = yes ] && ! docker volume rm "$volume" >/dev/null; then
    echo "smoke: WARNING could not remove volume ${volume} (label ${run_label})" >&2
  fi
  rm -f "$errfile"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

passed=0
failures=0
last_out=''

# judge <row> <rc 0|nz> <mode> <want> <out> <rc> <stderr>
# Modes: eq (exact), re (bash =~), nre (must not match), first (first line exact), firstre (first line =~).
judge() {
  local row=$1 want_rc=$2 mode=$3 want=$4 out=$5 rc=$6 err=$7 first ok=yes
  first=${out%%$'\n'*}
  case "$want_rc" in
    0) if [ "$rc" != 0 ]; then ok=no; fi ;;
    nz) if [ "$rc" = 0 ]; then ok=no; fi ;;
    *) echo "smoke: row ${row}: bad rc '${want_rc}'" >&2; exit 2 ;;
  esac
  case "$mode" in
    eq) if [ "$out" != "$want" ]; then ok=no; fi ;;
    re) if ! [[ $out =~ $want ]]; then ok=no; fi ;;
    nre) if [[ $out =~ $want ]]; then ok=no; fi ;;
    first) if [ "$first" != "$want" ]; then ok=no; fi ;;
    firstre) if ! [[ $first =~ $want ]]; then ok=no; fi ;;
    *) echo "smoke: row ${row}: bad mode '${mode}'" >&2; exit 2 ;;
  esac
  last_out=$out
  if [ "$ok" = yes ]; then
    echo "SMOKE ${row} OK"
    passed=$((passed + 1))
  else
    echo "SMOKE ${row} FAIL rc=${rc} want rc=${want_rc} ${mode} $(printf '%q' "$want"); got $(printf '%q' "$out"); stderr $(printf '%q' "$err")"
    failures=$((failures + 1))
  fi
}

# expect <row> <rc> <mode> <want> -- <argv...>: stdout captured, stderr kept apart and shown on FAIL.
expect() {
  local row=$1 want_rc=$2 mode=$3 want=$4 out rc
  if [ "$5" != -- ]; then
    echo "smoke: row ${row}: expect needs -- before the command" >&2
    exit 2
  fi
  shift 5
  if out=$("$@" 2>"$errfile"); then rc=0; else rc=$?; fi
  judge "$row" "$want_rc" "$mode" "$want" "$out" "$rc" "$(cat "$errfile")"
}

# expect_all: the same with stdout and stderr captured together (the K rows read Claude's error text).
expect_all() {
  local row=$1 want_rc=$2 mode=$3 want=$4 out rc
  if [ "$5" != -- ]; then
    echo "smoke: row ${row}: expect_all needs -- before the command" >&2
    exit 2
  fi
  shift 5
  if out=$("$@" 2>&1); then rc=0; else rc=$?; fi
  judge "$row" "$want_rc" "$mode" "$want" "$out" "$rc" ''
}

finish() {
  local expected=$1
  if [ "$failures" -eq 0 ] && [ "$passed" -eq "$expected" ]; then
    echo "SMOKE result OK"
    exit 0
  fi
  echo "SMOKE result FAIL (failures=${failures} passed=${passed} expected=${expected})"
  exit 1
}

if [ "$key_test" = yes ]; then
  expected=$SMOKE_KEY_CHECKS_EXPECTED
else
  expected=$SMOKE_CHECKS_EXPECTED
fi

# Setup as the service's starter tar leaves the volume: home and work 1000:1000 0755. The fresh volume root is
# root:root 0755, so uid 0 creates both through the owner bits; chmod runs while root still owns them (after chown
# it would need CAP_FOWNER); chown needs CAP_CHOWN only.
docker volume create --label "$run_label" "$volume" >/dev/null
volume_created=yes
expect SETUP 0 eq $'1000:1000:755:/workspace/home\n1000:1000:755:/workspace/home/work' -- \
  docker run --rm --pull never --network none --user 0:0 --read-only --cap-drop ALL --cap-add CHOWN \
  --label "$run_label" --mount "type=volume,src=$volume,dst=/workspace,volume-nocopy" "$image" \
  sh -c 'mkdir -p /workspace/home/work && chmod 0755 /workspace/home /workspace/home/work && chown 1000:1000 /workspace/home /workspace/home/work && stat -c %u:%g:%a:%n /workspace/home /workspace/home/work'
if [ "$failures" -ne 0 ]; then
  finish "$expected"
fi

# The service's create flags (services/workspace/src/docker/spec.ts), one per line: U-smoke-flags compares the
# lines between the markers with the create body.
spec_flags=(
# spec-flags begin
  --user 1000:1000
  --env HOME=/workspace/home
  --workdir /workspace/home/work
  --cpus 2
  --memory 2147483648
  --memory-swap 2147483648
  --pids-limit 512
  --oom-score-adj 500
  --tmpfs /tmp:rw,nosuid,nodev,exec,size=256m,mode=1777
  --cap-drop ALL
  --security-opt no-new-privileges:true
  --read-only
  --init
  --restart no
  --stop-timeout 10
  --mount "type=volume,src=$volume,dst=/workspace,volume-nocopy"
# spec-flags end
)

# The variable names a container holds; Docker adds HOSTNAME. Any other name is a finding, never added silently.
env_names_want=$'DISABLE_AUTOUPDATER\nHOME\nHOSTNAME\nLANG\nPATH'
env_names() {
  docker exec "$1" env | cut -d= -f1 | LC_ALL=C sort
}

if [ "$key_test" = yes ]; then
  if ! kid=$(docker run -d --pull never --network bridge --label "$run_label" "${spec_flags[@]}" "$image" sleep infinity); then
    kid=''
    echo "SMOKE result FAIL (the key-test container did not start)"
    exit 1
  fi
  expect K-env 0 eq "$env_names_want" -- env_names "$kid"
  k1_pattern='invalid api key|invalid x-api-key|authentication_error|401'
  shopt -s nocasematch
  expect_all K0 nz nre "$k1_pattern" -- docker exec "$kid" timeout 90 claude -p "Reply with OK"
  k0=$last_out
  # The fake value is assigned for the docker client only and passed by name, so it is on no command line and in
  # no container config. It has no real key prefix, so no secret scanner flags it.
  expect_all K1 nz re "$k1_pattern" -- env ANTHROPIC_API_KEY=academy-smoke-not-a-real-key docker exec --env ANTHROPIC_API_KEY "$kid" timeout 90 claude -p "Reply with OK"
  k1=$last_out
  shopt -u nocasematch
  expect K1-diff 0 eq '' -- test "$k1" != "$k0"
  finish "$expected"
fi

if ! id=$(docker run -d --pull never --network none --label "$run_label" "${spec_flags[@]}" "$image" sleep infinity); then
  id=''
  echo "SMOKE result FAIL (the main container did not start)"
  exit 1
fi
x() {
  docker exec "$id" "$@"
}

sleep 3
expect S1 0 eq true -- docker inspect --format '{{.State.Running}}' "$id"

expect S2-uid 0 eq 1000 -- x id -u
expect S2-gid 0 eq 1000 -- x id -g
expect S2-groups 0 eq 1000 -- x id -G
expect S2-name 0 eq learner -- x id -un
expect S2-passwd 0 eq 'learner:x:1000:1000:learner:/workspace/home:/bin/bash' -- x getent passwd 1000
expect S2-no-ubuntu nz eq '' -- x getent passwd ubuntu
expect S2-no-ubuntu-home 0 eq '' -- x test ! -e /home/ubuntu
# --user 1000:1000 adds no supplementary group whatever /etc/group says, so S2-groups cannot see a membership;
# docker exec --user learner or --user 1000 would get every group that names learner (or the base's ubuntu).
expect S2-members 0 eq '' -- x awk -F: '$4 ~ /(^|,)(learner|ubuntu)(,|$)/ { print $1 }' /etc/group

expect S3-home 0 eq /workspace/home -- x printenv HOME
expect S3-workdir 0 eq /workspace/home/work -- x pwd

expect S4-search-list 0 eq /opt/academy/bin:/opt/node/bin:/usr/local/go/bin:/opt/claude/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin -- x printenv PATH
expect S4-lang 0 eq C.UTF-8 -- x printenv LANG
expect S4-autoupdater 0 eq 1 -- x printenv DISABLE_AUTOUPDATER
expect S4-names 0 eq "$env_names_want" -- env_names "$id"

# One name per call: dash's command -v with several names reports only on the first.
for tool in python3=/usr/bin/python3 git=/usr/bin/git make=/usr/bin/make rg=/usr/bin/rg node=/opt/node/bin/node \
  npm=/opt/node/bin/npm npx=/opt/node/bin/npx go=/usr/local/go/bin/go claude=/opt/claude/bin/claude \
  tsp=/opt/academy/bin/tsp openapi-typescript=/opt/academy/bin/openapi-typescript; do
  expect "S5-${tool%%=*}" 0 eq "${tool#*=}" -- x sh -c 'command -v "$1"' sh "${tool%%=*}"
done
expect S5-python3-real 0 eq /usr/bin/python3.12 -- x realpath /usr/bin/python3
expect S5-npm-real 0 eq /opt/node/lib/node_modules/npm/bin/npm-cli.js -- x realpath /opt/node/bin/npm
expect S5-npx-real 0 eq /opt/node/lib/node_modules/npm/bin/npx-cli.js -- x realpath /opt/node/bin/npx

# #43 E5: the lesson checks search only the python3 directory, /usr/bin and /bin; none may find the real claude.
expect S6-pydir 0 eq /usr/bin -- x sh -c 'dirname "$(realpath "$(command -v python3)")"'
pydir=$last_out
expect S6-no-claude 0 eq '' -- x sh -c 'for d in "$@"; do { test ! -e "$d/claude" && test ! -L "$d/claude"; } || exit 1; done' sh /usr/bin /bin /usr/local/bin "$pydir"
expect S6-lookup nz eq '' -- x env -i "PATH=$pydir:/usr/bin:/bin" sh -c 'command -v claude'

tsp_version=1.17.0
openapi_typescript_version=v7.13.0
expect S7-python3 0 eq 'Python 3.12.3' -- x python3 --version
expect S7-git 0 eq 'git version 2.43.0' -- x git --version
expect S7-make 0 first 'GNU Make 4.3' -- x make --version
expect S7-rg 0 firstre '^ripgrep 14\.1\.0( |$)' -- x rg --version
expect S7-node 0 eq v22.23.4 -- x node --version
expect S7-arch 0 re '^(x86_64|aarch64)$' -- x uname -m
case "$last_out" in
  x86_64) go_arch=amd64 ;;
  aarch64) go_arch=arm64 ;;
  *) go_arch="unknown-${last_out}" ;;
esac
expect S7-go 0 eq "go version go1.27.3 linux/${go_arch}" -- x go version
expect S7-tsc 0 eq 'Version 5.9.3' -- x node /opt/academy/node/node_modules/typescript/bin/tsc --version
expect S7-tsp 0 eq "$tsp_version" -- x tsp --version
expect S7-openapi-typescript 0 eq "$openapi_typescript_version" -- x openapi-typescript --version
expect S7-claude 0 eq '2.1.311 (Claude Code)' -- x claude --version

# #44 runs its tools under this child environment; the && list is the whole script, so the first missing tool
# sets the status.
expect S8-child-env 0 eq "${tsp_version}"$'\n'"${openapi_typescript_version}"$'\n'"v22.23.4"$'\n'"go version go1.27.3 linux/${go_arch}" -- x env -i HOME=/workspace/home PATH=/opt/academy/bin:/opt/node/bin:/usr/local/go/bin:/usr/bin:/bin sh -c 'tsp --version && openapi-typescript --version && node --version && go version'
expect S8-wrapper 0 eq '#!/bin/sh' -- x sed -n 1p /opt/academy/bin/tsp

# A small-icu build returns an empty list.
expect S9 0 eq ru,ja -- x node -p "Intl.DateTimeFormat.supportedLocalesOf(['ru', 'ja']).join(',')"

expect S10-label 0 re '^[0-9]{4}[a-z]-' -- docker image inspect --format '{{index .Config.Labels "academy.image.tzdata"}}' "$image"
tz=$last_out
expect S10-dpkg 0 eq "$tz" -- x dpkg-query -W -f='${Version}' tzdata
expect S10-zonefile 0 eq '' -- x test -f /usr/share/zoneinfo/Europe/Moscow
expect S10-zoneinfo 0 eq Europe/Moscow -- x python3 -I -c 'import zoneinfo; print(zoneinfo.ZoneInfo("Europe/Moscow").key)'

# #43 pins 3.12 because fork is still the default start method there.
expect S11 0 eq 'True fork' -- x python3 -I -c 'import multiprocessing, sys; print(sys.version_info[:2] == (3, 12), multiprocessing.get_start_method())'

# #44: no curl, no compiler, no sudo.
for tool in curl wget gcc cc sudo; do
  expect "S12-${tool}" nz eq '' -- x sh -c 'command -v "$1"' sh "$tool"
done

# The positive control proves touch works where writing is allowed, so the failures below mean read-only.
expect S13-writable 0 eq '' -- x touch /workspace/home/.smoke /tmp/.smoke
for dir in / /etc /usr/bin /usr/local/go /opt/node /opt/claude/bin /opt/academy/node /opt/academy/bin /var/tmp /workspace; do
  expect "S13-readonly-${dir}" nz eq '' -- x touch "${dir%/}/.smoke-${run}"
done

write_go() {
  docker exec -i "$1" sh -c 'mkdir -p "$HOME/smoke-go" && cat > "$HOME/smoke-go/main.go"' <<'GO'
package main

import "fmt"

func main() {
	fmt.Println("go-ok")
}
GO
}
expect S14-file 0 eq '' -- write_go "$id"
expect S14-run 0 eq go-ok -- docker exec --env GOTOOLCHAIN=local --env GOPROXY=off "$id" go run /workspace/home/smoke-go/main.go

expect S15-config 0 eq 'null ["sleep","infinity"] 1000:1000' -- docker image inspect --format '{{json .Config.Entrypoint}} {{json .Config.Cmd}} {{.Config.User}}' "$image"
expect S15-env 0 eq '["PATH=/opt/academy/bin:/opt/node/bin:/usr/local/go/bin:/opt/claude/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin","HOME=/workspace/home","LANG=C.UTF-8","DISABLE_AUTOUPDATER=1"]' -- docker image inspect --format '{{json .Config.Env}}' "$image"
expect S15-no-workspace 0 eq '' -- docker run --rm --pull never --network none --read-only --label "$run_label" "$image" test ! -e /workspace

# As root with Docker's default capabilities in a throwaway container: GNU find exits 1 on any unreadable
# directory, which uid 1000 has.
root_find() {
  local image=$1
  shift
  docker run --rm --pull never --network none --read-only --user 0:0 --label "$run_label" "$image" find / -xdev "$@" | LC_ALL=C sort
}
# The base image's twelve files; a new one needs a reviewed decision.
expect S16 0 eq $'/usr/bin/chage\n/usr/bin/chfn\n/usr/bin/chsh\n/usr/bin/expiry\n/usr/bin/gpasswd\n/usr/bin/mount\n/usr/bin/newgrp\n/usr/bin/passwd\n/usr/bin/su\n/usr/bin/umount\n/usr/sbin/pam_extrausers_chkpwd\n/usr/sbin/unix_chkpwd' -- root_find "$image" -perm /6000 -type f

# What the kernel applied to a process docker exec starts (a learner's terminal is one, #32): no capability in any
# set and no-new-privileges. U-smoke-flags pins the flags as text; these rows read their effect.
for pair in inh=CapInh prm=CapPrm eff=CapEff bnd=CapBnd amb=CapAmb; do
  field=${pair#*=}
  expect "S17-cap-${pair%%=*}" 0 eq "${field}:"$'\t'0000000000000000 -- x grep "^${field}:" /proc/self/status
done
expect S17-no-new-privs 0 eq $'NoNewPrivs:\t1' -- x grep '^NoNewPrivs:' /proc/self/status

# S13 sees only the read-only mount. Modes and owners of the image's own tree: only the base's sticky scratch
# directories are world-writable, and nothing belongs to uid or gid 1000 (symlinks are always 0777 on Linux).
expect S18-world-writable 0 eq $'/run/lock\n/tmp\n/var/tmp' -- root_find "$image" -perm -0002 ! -type l
expect S18-learner-owned 0 eq '' -- root_find "$image" '(' -uid 1000 -o -gid 1000 ')'

finish "$expected"
