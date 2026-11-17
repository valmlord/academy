#!/usr/bin/env bash
# Isolated compose stack for #31/#32 (#31 design 12.6, #32 design section 9): the only way an agent runs docker
# compose on a machine that also runs the owner's stack (project academy). Everything here is derived from the run
# name: project academy-<run>, image tag <run>, workspace instance <run>, host ports per run (t31: 55432/53080,
# t32: 55433/53081), and every compose call gets an explicit environment through `env -i`, so neither the root .env
# nor the caller's shell can change the project, a tag or a port.
#   bash services/workspace/test/manual/isolated-stack.sh [t31|t32] [--e2e]
# A preflight stops the run before anything starts when objects of the run's project, instance or images are left
# over, or when a Docker listing fails. Checks: web answers, the service reaches Docker (P7), I1-I3 of
# check-image-migrations.sh, with --e2e the seed, the e2e suite, the course-unreadable spec with its restore and
# the service-down spec, the network probe with and without compose.db-port.yaml (NP), and the red runs of design
# 12.5 marked "Mac recipe", each between `<PREFIX> RED <name> BEGIN` and `<PREFIX> RED <name> END`. Teardown and a
# final check always run once the preflight passed.
# Exit 0 only when every check passed, every red run failed as expected and the teardown left nothing behind.
set -euo pipefail

# Arguments first: no docker call and no file before the run is known.
run=""
with_e2e=""
for arg in "$@"; do
  case $arg in
    t31 | t32) run=$arg ;;
    --e2e) with_e2e=1 ;;
    *)
      if [[ $arg =~ ^t[0-9]+$ ]]; then echo "unknown run $arg"; else echo "unknown argument $arg"; fi
      exit 1
      ;;
  esac
done
run=${run:-t31}
# Not the owner's 5432/3080, and one pair per run, so the owner's stack and both runs can live side by side.
case $run in
  t31) db_port=55432 web_port=53080 ;;
  t32) db_port=55433 web_port=53081 ;;
esac
PREFIX=$(printf '%s' "$run" | tr a-z A-Z)
readonly PREFIX

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
cd "$root"

readonly PROJECT=academy-$run
readonly INSTANCE=$run
readonly TAG=$run
# The T31 names are kept so the diff stays small; the values come from the run.
readonly DB_PORT_T31=$db_port
readonly WEB_PORT_T31=$web_port
readonly NODE_IMAGE=node:22.23.4-alpine
readonly POSTGRES_IMAGE=postgres:17.6-alpine
readonly OVERRIDE=compose.db-port.yaml
readonly API=services/workspace/test/network/api.mjs
readonly PROBE=services/workspace/test/network/probe-isolation.sh
readonly PROBE_USER=probeuser
readonly HELPER=probe-helper-$PROJECT-$INSTANCE
readonly OWNER_VOLUME=academy_db-data
readonly OWNER_IMAGE=academy-web:local
readonly T31_VOLUME=${PROJECT}_db-data
readonly T31_IMAGES=("academy-web:$TAG" "academy-workspace-service:$TAG")
readonly MANAGED=(--filter label=academy.workspace.managed=true --filter "label=academy.workspace.instance=$INSTANCE")

# Preflight, fail closed, before mktemp, openssl and the trap: a refusal creates nothing and removes nothing, so
# leftovers of an earlier run (or a planted object) are never taken for this run's own. One reference per listing:
# `docker image ls` accepts at most one.
for kind in ps volume network; do
  for label in "com.docker.compose.project=$PROJECT" "academy.workspace.instance=$INSTANCE"; do
    case $kind in
      ps) listing=(docker ps -aq --filter "label=$label") ;;
      *) listing=(docker "$kind" ls -q --filter "label=$label") ;;
    esac
    if ! out=$("${listing[@]}"); then echo "$PREFIX STOP preflight listing failed"; exit 1; fi
    if [ -n "$out" ]; then echo "$PREFIX STOP leftovers of $PROJECT exist"; exit 1; fi
  done
done
for image in "${T31_IMAGES[@]}"; do
  if ! out=$(docker image ls -q "$image"); then echo "$PREFIX STOP preflight listing failed"; exit 1; fi
  if [ -n "$out" ]; then echo "$PREFIX STOP leftovers of $PROJECT exist"; exit 1; fi
done

tmp=$(mktemp -d)
stack_started=""
status=0
owner_containers=""

# Throwaway secrets of a stack that lives minutes. They travel as `env -i` arguments, so they are briefly visible
# in ps: accepted for these, never for the owner's .env values. Never echoed.
auth_secret=$(openssl rand -hex 32)
service_secret=$(openssl rand -hex 32)

# The workspaces run on NODE_IMAGE, which has no bash: the terminal specs need the compose default /bin/bash
# replaced by the shell that image has.
envv=(env -i "PATH=$PATH" "HOME=$HOME" COMPOSE_ENV_FILES=/dev/null "COMPOSE_PROJECT_NAME=$PROJECT"
  "WEB_IMAGE_TAG=$TAG" "WORKSPACE_SERVICE_IMAGE_TAG=$TAG" "WORKSPACE_INSTANCE=$INSTANCE"
  "DB_PORT=$DB_PORT_T31" "WEB_PORT=$WEB_PORT_T31" "WORKSPACE_IMAGE=$NODE_IMAGE" "TERMINAL_SHELL=/bin/sh"
  "BETTER_AUTH_SECRET=$auth_secret" "WORKSPACE_SERVICE_SECRET=$service_secret")
base=("${envv[@]}" docker compose -p "$PROJECT" -f docker-compose.yml)
with_port=("${base[@]}" -f "$OVERRIDE")
no_socket=("${base[@]}" -f "$tmp/no-socket.yaml")

# The P7 red run: the service without the socket mount, course mount kept.
cat >"$tmp/no-socket.yaml" <<'YAML'
services:
  workspace:
    volumes: !override
      - ./course:/course:ro
YAML

# Parses `config --format json` from stdin. Prints only issue paths, never values: the rendered config holds
# the interpolated secrets.
readonly GUARD_JS='
import { z } from "zod";
const [label, root, project, tag] = process.argv.slice(1);
let text = "";
for await (const chunk of process.stdin) text += chunk;
const named = z.looseObject({ name: z.string(), external: z.boolean().optional() });
const config = z.looseObject({
  name: z.string(),
  services: z.record(z.string(), z.looseObject({
    image: z.string().optional(),
    container_name: z.string().optional(),
    ports: z.array(z.looseObject({ published: z.union([z.string(), z.number()]).optional() })).optional(),
    volumes: z.array(z.looseObject({ type: z.string(), source: z.string().optional(), target: z.string(),
      read_only: z.boolean().optional() })).optional(),
  })),
  networks: z.record(z.string(), named),
  volumes: z.record(z.string(), named),
}).safeParse(JSON.parse(text));
text = "";
if (!config.success) {
  console.log(`zod issues at: ${config.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  process.exit(1);
}
const { name, services, networks, volumes } = config.data;
const issues = [];
const expect = (isTrue, path) => { if (!isTrue) issues.push(path); };
expect(name === project, "name");
expect(services.db?.image === "postgres:17.6-alpine", "services.db.image");
expect(services.web?.image === `academy-web:${tag}`, "services.web.image");
expect(services.workspace?.image === `academy-workspace-service:${tag}`, "services.workspace.image");
expect(volumes["db-data"]?.name === `${project}_db-data`, "volumes.db-data.name");
expect(networks.default?.name === `${project}_default`, "networks.default.name");
expect(networks["workspace-api"]?.name === `${project}_workspace-api`, "networks.workspace-api.name");
for (const [kind, map] of [["networks", networks], ["volumes", volumes]]) {
  for (const [key, value] of Object.entries(map)) {
    expect(value.name.startsWith(`${project}_`) && value.external !== true, `${kind}.${key}`);
  }
}
for (const [key, service] of Object.entries(services)) {
  expect(service.container_name === undefined, `services.${key}.container_name`);
  for (const port of service.ports ?? []) {
    expect(!["5432", "3080"].includes(String(port.published)), `services.${key}.ports`);
  }
}
if (label === "no-socket") {
  const mounts = services.workspace?.volumes ?? [];
  expect(mounts.length === 1 && mounts[0].type === "bind" && mounts[0].source === `${root}/course`
    && mounts[0].target === "/course" && mounts[0].read_only === true, "services.workspace.volumes");
}
if (issues.length > 0) {
  console.log(`wrong at: ${issues.join(", ")}`);
  process.exit(1);
}'

# guard <label> <compose command...>: exits the script before any up when the file set is not isolated.
guard() {
  local label=$1 config
  shift
  config=$("$@" config --format json 2>/dev/null) || { echo "$PREFIX FAIL guard $label: compose config failed"; exit 1; }
  if ! printf '%s' "$config" | (cd services/workspace && node --input-type=module -e "$GUARD_JS" "$label" "$root" "$PROJECT" "$TAG"); then
    unset config
    echo "$PREFIX FAIL guard $label"
    exit 1
  fi
  unset config
  echo "$PREFIX OK guard $label"
}

# The owner's objects by name (read-only listings only); the final check needs each of them still there.
# grep reads its whole input (no -q): under pipefail an early exit would fail the listing with SIGPIPE.
snapshot() {
  docker volume ls --filter "name=$OWNER_VOLUME" --format '{{.Name}}' | grep -Fx "$OWNER_VOLUME" >/dev/null &&
    docker image ls --format '{{.Repository}}:{{.Tag}}' academy-web | grep -Fx "$OWNER_IMAGE" >/dev/null &&
    docker ps -a --filter label=com.docker.compose.project=academy --format '{{.Names}}'
}

api() { "${base[@]}" exec -T workspace node --input-type=module - "$@" <"$API"; }
no_socket_reach() { "${no_socket[@]}" exec -T workspace node --input-type=module - reach <"$API"; }
probe() { "${envv[@]}" "COMPOSE_FILE=$1" bash "$PROBE" "$PROJECT" "$INSTANCE" "${@:2}"; }

# red_run <name> <expected line regex> <command...>: the command must fail and print the expected line.
red_run() {
  local name=$1 expected=$2 out rc=0
  shift 2
  echo "$PREFIX RED $name BEGIN"
  out=$("$@" 2>&1) || rc=$?
  printf '%s\n' "$out"
  if [ "$rc" -ne 0 ] && grep -Eq "$expected" <<<"$out"; then
    echo "$PREFIX OK red $name: failed as expected (rc=$rc)"
  else
    echo "$PREFIX FAIL red $name: expected a failure with /$expected/ (rc=$rc)"
    status=1
  fi
  echo "$PREFIX RED $name END"
}

teardown() {
  local rc=$? failed=0 ids line
  set +e
  tfail() {
    echo "$PREFIX TEARDOWN FAIL $*"
    failed=1
  }
  if [ -n "$stack_started" ]; then
    api delete "$PROBE_USER" >/dev/null || tfail "delete of the $PROBE_USER workspace through the API"
  fi
  # Before down: a probe workspace still on a stack network (red runs s-row, d-row) would block its removal.
  ids=$(docker ps -aq "${MANAGED[@]}") || tfail "list of $INSTANCE workspace containers"
  if [ -n "$ids" ]; then docker rm -f $ids >/dev/null || tfail "docker rm -f of $INSTANCE workspace containers"; fi
  "${base[@]}" down --remove-orphans || tfail "compose down --remove-orphans"
  ids=$(docker volume ls -q "${MANAGED[@]}") || tfail "list of $INSTANCE workspace volumes"
  if [ -n "$ids" ]; then docker volume rm $ids >/dev/null || tfail "docker volume rm of $INSTANCE workspace volumes"; fi
  ids=$(docker network ls -q "${MANAGED[@]}") || tfail "list of $INSTANCE workspace networks"
  if [ -n "$ids" ]; then docker network rm $ids >/dev/null || tfail "docker network rm of $INSTANCE workspace networks"; fi
  if docker volume ls --filter "name=$T31_VOLUME" --format '{{.Name}}' | grep -Fx "$T31_VOLUME" >/dev/null; then
    docker volume rm "$T31_VOLUME" >/dev/null || tfail "docker volume rm $T31_VOLUME"
  fi
  for image in "${T31_IMAGES[@]}"; do
    if [ -n "$(docker image ls --format '{{.ID}}' "$image")" ]; then
      docker image rm "$image" >/dev/null || tfail "docker image rm $image"
    fi
  done
  # The probe removes its helper by Id; this only catches a probe killed before its own teardown.
  ids=$(docker ps -aq --filter "name=^$HELPER\$" --filter label=academy.workspace.test-run) || tfail "list of the probe helper"
  if [ -n "$ids" ]; then docker rm -f $ids >/dev/null || tfail "docker rm -f $HELPER"; fi
  rm -rf "$tmp" || tfail "rm -rf of the temp directory"

  for kind in ps volume network; do
    for label in "com.docker.compose.project=$PROJECT" "academy.workspace.instance=$INSTANCE"; do
      case $kind in
        ps) ids=$(docker ps -aq --filter "label=$label") ;;
        *) ids=$(docker "$kind" ls -q --filter "label=$label") ;;
      esac
      if [ $? -ne 0 ] || [ -n "$ids" ]; then tfail "left behind: $kind with $label"; else echo "$PREFIX OK nothing left: $kind with $label"; fi
    done
  done
  if [ -n "$owner_containers" ] || [ -n "$stack_started" ]; then
    if docker volume ls --filter "name=$OWNER_VOLUME" --format '{{.Name}}' | grep -Fx "$OWNER_VOLUME" >/dev/null &&
      docker image ls --format '{{.Repository}}:{{.Tag}}' academy-web | grep -Fx "$OWNER_IMAGE" >/dev/null; then
      echo "$PREFIX OK owner volume and image still there"
    else
      tfail "owner volume $OWNER_VOLUME or image $OWNER_IMAGE missing"
    fi
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      if docker ps -a --filter label=com.docker.compose.project=academy --format '{{.Names}}' | grep -Fx "$line" >/dev/null; then
        echo "$PREFIX OK owner container still there: $line"
      else
        tfail "owner container missing: $line"
      fi
    done <<<"$owner_containers"
  fi
  if [ "$rc" -ne 0 ] || [ "$status" -ne 0 ] || [ "$failed" -ne 0 ]; then
    echo "$PREFIX RESULT FAIL (run rc=$rc, check status=$status, teardown failed=$failed)"
    exit 1
  fi
  echo "$PREFIX RESULT OK"
  exit 0
}

# web_log_clean: Delta 5. Fails when web's log since start has a Next-logged server error; called before service-down,
# which makes web log errors on purpose. Called only as an if condition (set -e is off there), so it returns explicitly.
web_log_clean() {
  local log
  log=$("${base[@]}" logs --no-color web) || { echo "$PREFIX FAIL web-log: docker compose logs web failed"; return 1; }
  if ! grep -qF 'web: database migrations applied' <<<"$log"; then
    echo "$PREFIX FAIL web-log: web log lacks \"web: database migrations applied\"; the guard did not read this stack's web log"
    return 1
  fi
  if grep -nF -e '⨯' -e 'Error [' <<<"$log"; then
    echo "$PREFIX FAIL web-log: web logged a server error during the e2e run (matching lines above)"
    return 1
  fi
}

# run_e2e_stages: seed, the e2e suite, the course-unreadable spec and the service-down spec against this stack
# (design 9, order 10). A failed stage sets status and the run goes on, so service-back always restores the service
# before the probes. The seed password lives only in this function's arguments and is never echoed.
run_e2e_stages() {
  local seed_password ids
  seed_password=$(openssl rand -hex 24)
  local e2e_env=("${envv[@]}" ACADEMY_SKIP_ROOT_ENV=1
    "DATABASE_URL=postgres://academy:academy@127.0.0.1:$DB_PORT_T31/academy" SEED_EMAIL=learner@example.com
    "SEED_PASSWORD=$seed_password" "E2E_BASE_URL=http://127.0.0.1:$WEB_PORT_T31" E2E_TERMINAL=1 E2E_WEBKIT=1 E2E_DISPOSABLE_STACK=1)
  if "${e2e_env[@]}" pnpm seed; then echo "$PREFIX OK seed"; else echo "$PREFIX FAIL seed"; status=1; fi
  if "${e2e_env[@]}" pnpm test:e2e; then echo "$PREFIX OK e2e"; else echo "$PREFIX FAIL e2e"; status=1; fi
  if web_log_clean; then echo "$PREFIX OK web-log"; else status=1; fi
  # #96: the spec makes course.yaml unreadable in this run's web container only (E2E_COMPOSE_PROJECT), and the
  # restore after it runs whatever the spec did, so service-down gets a course the web user can read.
  if "${e2e_env[@]}" E2E_COURSE_UNREADABLE=1 "E2E_COMPOSE_PROJECT=$PROJECT" \
    PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/course-unreadable.json pnpm --filter @academy/web exec \
    playwright test e2e/course-unreadable.spec.ts --project=chromium --workers=1 \
    --output test-results/course-unreadable --reporter=list,json; then
    echo "$PREFIX OK course-unreadable"
  else
    echo "$PREFIX FAIL course-unreadable"
    status=1
  fi
  if "${base[@]}" exec -u 0 -T web sh -c 'chmod a+r /app/course/*/course.yaml' &&
    "${base[@]}" exec -T web sh -c 'cat /app/course/*/course.yaml >/dev/null'; then
    echo "$PREFIX OK course-restore"
  else
    echo "$PREFIX FAIL course-restore"
    status=1
  fi
  if "${base[@]}" stop workspace &&
    "${e2e_env[@]}" E2E_SERVICE_DOWN=1 pnpm --filter @academy/web exec playwright test e2e/service-down.spec.ts \
      --project=chromium --output test-results/service-down; then
    echo "$PREFIX OK service-down"
  else
    echo "$PREFIX FAIL service-down"
    status=1
  fi
  if "${base[@]}" up -d --wait workspace && api reach; then echo "$PREFIX OK service-back"; else echo "$PREFIX FAIL service-back"; status=1; fi
  # This run's e2e workspaces only (managed and instance labels); their volumes stay for the teardown.
  if ids=$(docker ps -aq "${MANAGED[@]}") && { [ -z "$ids" ] || docker rm -f $ids >/dev/null; }; then
    echo "$PREFIX OK e2e-cleanup"
  else
    echo "$PREFIX FAIL e2e-cleanup"
    status=1
  fi
}
trap teardown EXIT

# Guard every file set before any up, including the COMPOSE_FILE form check-image-migrations.sh uses.
guard base "${base[@]}"
guard db-port "${with_port[@]}"
guard db-port-env "${envv[@]}" "COMPOSE_FILE=docker-compose.yml:$OVERRIDE" docker compose
guard no-socket "${no_socket[@]}"

owner_containers=$(snapshot) || { echo "$PREFIX FAIL owner snapshot ($OWNER_VOLUME, $OWNER_IMAGE, project academy)"; exit 1; }
echo "$PREFIX OK owner snapshot taken"

# 16.5 H9: node is pulled only when absent; postgres is never pulled (compose up would, and H9 allows no
# compose pull).
node_id=$(docker image ls --format '{{.ID}}' "$NODE_IMAGE")
postgres_id=$(docker image ls --format '{{.ID}}' "$POSTGRES_IMAGE")
if [ -z "$node_id" ]; then docker pull "$NODE_IMAGE"; fi
if [ -z "$postgres_id" ]; then
  echo "$PREFIX STOP $POSTGRES_IMAGE absent (16.5 H9)"
  exit 1
fi

stack_started=1
"${with_port[@]}" --progress plain up -d --build --wait --wait-timeout 300
curl -fsS -o /dev/null "http://127.0.0.1:$WEB_PORT_T31/"
echo "$PREFIX OK web answers on 127.0.0.1:$WEB_PORT_T31"
api reach
echo "$PREFIX OK workspace service reaches Docker (P7)"
"${envv[@]}" "COMPOSE_FILE=docker-compose.yml:$OVERRIDE" bash apps/web/scripts/check-image-migrations.sh
echo "$PREFIX OK check-image-migrations.sh"
if [ -n "$with_e2e" ]; then run_e2e_stages; fi
probe "docker-compose.yml:$OVERRIDE" --rows c2
echo "$PREFIX OK probe c2 (db published: the D-row target is reachable, positive control)"

# db recreated without the publish: the default stack the D rows describe.
"${base[@]}" up -d --wait db
probe docker-compose.yml --rows all
echo "$PREFIX OK probe all"

# Red runs of 12.5 marked "Mac recipe". join_and_probe <network>: the probe workspace joins one of the stack's
# networks before the probe; a failed ensure or connect returns 0, which red_run counts as a failed red run.
join_and_probe() {
  local workspace
  workspace=$(api ensure "$PROBE_USER") || return 0
  docker network connect "$1" "$workspace" || return 0
  probe docker-compose.yml --rows all
}
# The S row: the probe workspace joins the service's network.
red_run s-row '^NP S1 FAIL .* REACHABLE$' join_and_probe "${PROJECT}_workspace-api"
red_run assume-linux '^NP W2a FAIL .* REACHABLE$' probe docker-compose.yml --rows all --assume-platform linux
# The D2 row: the probe workspace joins db's network while db publishes nothing, so D2 must stay strict.
red_run d-row '^NP D2 FAIL .* REACHABLE$' join_and_probe "${PROJECT}_default"

# P7's red run last, then the service gets its socket back so the teardown can delete through the API.
"${no_socket[@]}" up -d --wait workspace
red_run no-socket '^P7 status=503 code=docker-unavailable$' no_socket_reach
"${base[@]}" up -d --wait workspace
api reach
echo "$PREFIX OK workspace service reaches Docker again after the red run"
