#!/usr/bin/env bash
# Builds the lesson workspace image and tags it only after its smoke test passed (ADR-0002 item 10).
#
#   bash scripts/build-workspace-image.sh [academy-workspace:<tag>]     default academy-workspace:dev
#
# The build goes to <image>-candidate; images/workspace/test/smoke.sh tests that build, and only then does <image>
# move to it, by Id. On a failure <image> is unchanged with its previous Id, or already the tested build when the
# failure comes after the tag moved; the FAIL line says which. Exit codes: 0 delivered; 1 any failure, always with a
# FAIL line saying where <image> stands; 2 usage, or a name refused inside a Claude Code session.
#
# Written for bash 3.2 (macOS) and 5.2 (CI): no mapfile, no associative arrays; no "a && b" list as a statement,
# because its status is 1 when "a" is false. docker is called by name only.
set -euo pipefail

# 117: the script's own "<image>-candidate" then stays within Docker's 128-character tag.
name_re='^academy-workspace:[a-z0-9][a-z0-9._-]{0,117}$'
# "yes" once the run printed its own final line (usage, refusal, FAIL, OK); the EXIT trap reports the rest.
reported=no
usage() {
  echo "build-workspace-image: expected academy-workspace:<tag>, got '$1'" >&2
  reported=yes
  exit 2
}

if [ "$#" -gt 1 ]; then
  usage "$*"
fi
image=${1:-academy-workspace:dev}
if ! [[ $image =~ $name_re ]]; then
  usage "$image"
fi
case "$image" in
  *-candidate) usage "$image" ;;
esac
# A guardrail against an agent's slip, not a control: an agent may build academy-workspace:t33* only (design #33,
# section 7), and the variable is easy to unset. CI does not set it.
if [ -n "${CLAUDECODE-}" ]; then
  case "$image" in
    academy-workspace:t33*) ;;
    *)
      echo "build-workspace-image: refusing ${image} inside a Claude Code session (CLAUDECODE is set); agents build academy-workspace:t33* only" >&2
      reported=yes
      exit 2
      ;;
  esac
fi

# fail <text>: the one way this script ends with exit 1.
fail() {
  echo "build-workspace-image: FAIL: $1" >&2
  reported=yes
  exit 1
}

# How <image> stands now, against what this run saw before it started and what it built; a FAIL line after the
# build uses it instead of assuming the tag did or did not move.
image_state() {
  local now
  if now=$(docker image inspect --format '{{.Id}}' "$image" 2>"${errfile:-/dev/null}"); then
    :
  elif grep -q 'No such image' "${errfile:-/dev/null}"; then
    now=absent
  else
    now=unknown
  fi
  if [ "$now" != unknown ] && [ "$now" = "${prev-}" ]; then
    printf '%s unchanged (%s)' "$image" "$prev"
  elif [ -n "${new-}" ] && [ "$now" = "$new" ]; then
    printf '%s is now %s (tested; previous: %s)' "$image" "$new" "${prev:-not read}"
  else
    printf '%s is %s (before this run: %s)' "$image" "$now" "${prev:-not read}"
  fi
}

# A failure that stops before the Id is known (unreadable iidfile, interrupt) may still leave the candidate tagged:
# name it, so it can be removed. Empty before the candidate name is set.
candidate_left() {
  local id
  if [ -n "${candidate-}" ] && id=$(docker image inspect --format '{{.Id}}' "$candidate" 2>/dev/null); then
    printf '; %s exists (%s), maybe from this build (docker image rm %s removes it)' "$candidate" "$id" "$candidate"
  fi
}

on_exit() {
  local rc=$?
  local why
  # A second Ctrl-C or SIGTERM must not cut this report short. The cost: a docker call that hangs in here (and its
  # child, which inherits the ignored signals) then stops only with Ctrl-\ (SIGQUIT), a closed terminal (SIGHUP) or
  # SIGKILL.
  trap '' INT TERM
  if [ "$rc" -ne 0 ] && [ "$reported" != yes ]; then
    why="stopped by an unexpected error (rc ${rc})"
    if [ "$rc" -eq 130 ]; then
      why="interrupted (SIGINT)"
    elif [ "$rc" -eq 143 ]; then
      why="interrupted (SIGTERM)"
    fi
    echo "build-workspace-image: FAIL: ${why} before its report; $(image_state)$(candidate_left)" >&2
  fi
  rm -f "${iidfile-}" "${errfile-}"
  if [ "$rc" -ne 0 ] && [ "$reported" != yes ]; then
    exit 1
  fi
}
trap on_exit EXIT
# Without these, bash runs the EXIT trap with $? = 0 after SIGINT or SIGTERM, and on_exit would print nothing.
trap 'exit 130' INT
trap 'exit 143' TERM

if ! root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel); then
  fail "not inside the academy git checkout (git rev-parse failed); ${image} not touched"
fi
candidate="${image}-candidate"
if ! iidfile=$(mktemp) || ! errfile=$(mktemp); then
  fail "mktemp failed; ${image} not touched"
fi

# "unknown" (daemon unreachable, permission denied) is never reported as "absent": a FAIL line must not claim
# there was no image when the script simply could not ask.
if prev=$(docker image inspect --format '{{.Id}}' "$image" 2>"$errfile"); then
  :
elif grep -q 'No such image' "$errfile"; then
  prev=absent
else
  prev=unknown
fi

# The label records the committed tree of images/workspace; uncommitted edits are not in that hash, so they are
# marked with a -dirty suffix instead. --verify -q: without it rev-parse prints its argument for an absent path.
tree=$(git -C "$root" rev-parse --verify -q "HEAD:images/workspace" || printf none)
if ! porcelain=$(git -C "$root" status --porcelain -- images/workspace); then
  fail "git status failed, so the context label cannot be trusted; ${image} unchanged (${prev})"
fi
if [ -n "$porcelain" ]; then
  tree="${tree}-dirty"
  echo "build-workspace-image: WARNING images/workspace has uncommitted changes; the label says ${tree}" >&2
fi

# No --pull: the pinned base is used from the daemon when present. No --build-arg: nothing from the caller's
# environment can enter the build. --provenance/--sbom off: no attestation records build metadata.
if ! docker build --progress=plain --provenance=false --sbom=false --iidfile "$iidfile" \
  --label "academy.image.context=${tree}" -t "$candidate" "$root/images/workspace"; then
  fail "docker build failed; ${image} unchanged (${prev})"
fi
if ! new=$(cat "$iidfile"); then
  fail "cannot read the image Id docker build wrote; ${image} unchanged (${prev})$(candidate_left)"
fi
if ! [[ $new =~ ^sha256:[0-9a-f]{64}$ ]]; then
  fail "docker build wrote no image Id ('${new}'); ${image} unchanged (${prev})"
fi

# Another run of the script for the same name may retag the candidate meanwhile: the smoke must test this build,
# and the tag must move only to an Id this run tested.
candidate_is_new() {
  local now
  if now=$(docker image inspect --format '{{.Id}}' "$candidate" 2>"$errfile"); then
    :
  elif grep -q 'No such image' "$errfile"; then
    now=absent
  else
    # Not "No such image" (daemon unreachable, permission denied): whether another run moved the candidate is
    # unknown, so the line does not guess.
    fail "cannot read ${candidate} (docker image inspect failed); $(image_state)"
  fi
  if [ "$now" != "$new" ]; then
    fail "${candidate} is ${now}, not this build ${new} (another run of the script?); ${image} unchanged (${prev})"
  fi
}

candidate_is_new
if ! bash "$root/images/workspace/test/smoke.sh" "$candidate"; then
  fail "smoke test failed; ${image} unchanged (${prev}); the new build stays as ${candidate} for diagnosis (docker image rm ${candidate} removes it)"
fi
candidate_is_new

if ! docker tag "$new" "$image"; then
  fail "docker tag ${new} ${image} failed; $(image_state); the tested build stays as ${candidate} (docker image rm ${candidate} removes it)"
fi
# Both names point at one Id, so this only untags.
if ! docker image rm "$candidate" >/dev/null; then
  fail "${image} is now ${new} (tested; previous: ${prev}), but removing the tag ${candidate} failed; docker image rm ${candidate} removes it"
fi

reported=yes
# The rm hint never names the image just delivered: a fully cached rebuild gives the same Id as before.
if [ "$prev" = "$new" ]; then
  echo "build-workspace-image: OK ${image} ${new} (unchanged: the same image as before)"
elif [[ $prev =~ ^sha256: ]]; then
  echo "build-workspace-image: OK ${image} ${new} (previous: ${prev})"
  echo "build-workspace-image: the previous image stays on disk untagged; docker image rm ${prev} frees it once no container uses it"
else
  echo "build-workspace-image: OK ${image} ${new} (previous: ${prev})"
fi
