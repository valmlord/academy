#!/usr/bin/env bash
# Fetches apt packages for an image build with retries, without installing them (#130).
# apt 2.8.3 retries 5xx and timeouts per request, but not a size or hash mismatch or an empty-body 5xx, and
# update exits 0 on a failed index unless told otherwise; hence whole attempts around update and download.
# Bounded by attempts, not by time: a slow mirror is not an outage (green CI apt phases took up to 431 s on
# 2026-11-10); each try ends after 30 s without data; a stalled request costs about 6.5 min, so a full stall
# ends at the CI step timeout, which is the only wall bound.
# Lists are cleaned per attempt; debs do not survive an update (the base's docker-clean deletes them), so a
# retry downloads everything again, and on success the last apt call here is the download.
# The caller's --no-download install is trusted because archives/ is written in that RUN only by apt calls of
# this script, from lists apt checked against the archive signing key, and apt moves a file from partial/ to
# archives/ only after it matches the hash in the signed index. Only --cainfo is accepted, so no caller
# can weaken apt's signature or date checks. It never falls back to another mirror: the dated snapshot is what
# makes a rebuild install the same packages (ADR-0002 item 10).
# 3 attempts 60 s apart and 5 apt retries cover the 1- to 2-minute outage windows of 2026-11-10 and fit the
# 15-minute CI build step; 30 s is the no-data timeout per request.
set -euo pipefail

attempts_max=3
pause_seconds=60
network_options=(-o Acquire::Retries=5 -o Debug::Acquire::Retries=true -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30)

# The caller's arguments are printed as data inside a fixed format, never used as a format or evaluated.
usage() {
  printf 'workspace image: apt-download.sh: usage: bash apt-download.sh [--cainfo <readable file>] <package>... (no other options); got: %s\n' "${original_args[*]}" >&2
  exit 2
}

original_args=("$@")
apt_options=()
if [ "${1-}" = --cainfo ]; then
  if ! test -r "${2-}"; then usage; fi
  apt_options=(-o "Acquire::https::CAInfo=$2")
  shift 2
fi
if [ "$#" -eq 0 ]; then usage; fi
for arg in "$@"; do
  case "$arg" in
    -*) usage ;;
  esac
done
packages=("$@")

source_uris() {
  local uris
  if uris=$(grep -h '^URIs:' /etc/apt/sources.list.d/*.sources 2>/dev/null); then
    printf '%s' "$uris" | sed 's/^URIs: *//' | tr '\n' ' ' | sed 's/ $//'
  else
    printf 'unknown (no URIs: line in /etc/apt/sources.list.d)'
  fi
}

attempt=0
while :; do
  attempt=$((attempt + 1))
  rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/partial/*
  if apt-get "${apt_options[@]}" "${network_options[@]}" update --error-on=any; then
    if ! apt-get "${apt_options[@]}" install --simulate -y --no-install-recommends "${packages[@]}" >/dev/null; then
      printf "workspace image: apt-get update succeeded but the requested packages do not resolve against %s; the package list or a pin is wrong (apt's E: line above), so no retry: %s\n" "$(source_uris)" "${packages[*]}" >&2
      exit 1
    fi
    if apt-get "${apt_options[@]}" "${network_options[@]}" install -y --no-install-recommends --download-only "${packages[@]}"; then
      printf 'workspace image: apt downloads complete on attempt %s after %s s\n' "$attempt" "$SECONDS" >&2
      exit 0
    else
      last_failure="apt-get install --download-only exited $?"
    fi
  else
    last_failure="apt-get update exited $?"
  fi
  if [ "$attempt" -ge "$attempts_max" ]; then break; fi
  printf "workspace image: apt attempt %s of %s failed: %s after %s s; apt's E: lines above give the reason; next attempt in %s s\n" "$attempt" "$attempts_max" "$last_failure" "$SECONDS" "$pause_seconds" >&2
  sleep "$pause_seconds"
done
printf "workspace image: apt gave up after %s attempts and %s s; last failure: %s; sources: %s. apt's E: lines above give the reason. No other mirror was tried and the pinned versions are unchanged, on purpose; rebuild later.\n" "$attempts_max" "$SECONDS" "$last_failure" "$(source_uris)" >&2
exit 1
