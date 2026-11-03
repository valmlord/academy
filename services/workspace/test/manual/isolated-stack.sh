#!/usr/bin/env bash
# Isolated compose stack for #31 (design 12.6): the only way an agent runs docker compose on a machine that also
# runs the owner's stack (project academy). Everything here is project academy-t31, image tag t31, workspace
# instance t31 and host ports 55432/53080, and every compose call gets an explicit environment through
# `env -i`, so neither the root .env nor the caller's shell can change the project, a tag or a port.
#   bash services/workspace/test/manual/isolated-stack.sh
# Checks: web answers, the service reaches Docker (P7), I1-I3 of check-image-migrations.sh, the network probe
# with and without compose.db-port.yaml (NP), and the red runs of design 12.5 marked "Mac recipe", each between
# `T31 RED <name> BEGIN` and `T31 RED <name> END`. Teardown and a final check always run.
# Exit 0 only when every check passed, every red run failed as expected and the teardown left nothing behind.
set -euo pipefail

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
cd "$root"

readonly PROJECT=academy-t31
readonly INSTANCE=t31
readonly TAG=t31
# Not the owner's 5432/3080, so both stacks run side by side.
readonly DB_PORT_T31=55432
readonly WEB_PORT_T31=53080
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

tmp=$(mktemp -d)
stack_started=""
status=0
owner_containers=""

# Throwaway secrets of a stack that lives minutes. They travel as `env -i` arguments, so they are briefly visible
# in ps: accepted for these, never for the owner's .env values. Never echoed.
auth_secret=$(openssl rand -hex 32)
service_secret=$(openssl rand -hex 32)

envv=(env -i "PATH=$PATH" "HOME=$HOME" COMPOSE_ENV_FILES=/dev/null "COMPOSE_PROJECT_NAME=$PROJECT"
  "WEB_IMAGE_TAG=$TAG" "WORKSPACE_SERVICE_IMAGE_TAG=$TAG" "WORKSPACE_INSTANCE=$INSTANCE"
  "DB_PORT=$DB_PORT_T31" "WEB_PORT=$WEB_PORT_T31" "WORKSPACE_IMAGE=$NODE_IMAGE"
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
const [label, root] = process.argv.slice(1);
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
expect(name === "academy-t31", "name");
expect(services.db?.image === "postgres:17.6-alpine", "services.db.image");
expect(services.web?.image === "academy-web:t31", "services.web.image");
expect(services.workspace?.image === "academy-workspace-service:t31", "services.workspace.image");
expect(volumes["db-data"]?.name === "academy-t31_db-data", "volumes.db-data.name");
expect(networks.default?.name === "academy-t31_default", "networks.default.name");
expect(networks["workspace-api"]?.name === "academy-t31_workspace-api", "networks.workspace-api.name");
for (const [kind, map] of [["networks", networks], ["volumes", volumes]]) {
  for (const [key, value] of Object.entries(map)) {
    expect(value.name.startsWith("academy-t31_") && value.external !== true, `${kind}.${key}`);
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
  config=$("$@" config --format json 2>/dev/null) || { echo "T31 FAIL guard $label: compose config failed"; exit 1; }
  if ! printf '%s' "$config" | (cd services/workspace && node --input-type=module -e "$GUARD_JS" "$label" "$root"); then
    unset config
    echo "T31 FAIL guard $label"
    exit 1
  fi
  unset config
  echo "T31 OK guard $label"
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
  echo "T31 RED $name BEGIN"
  out=$("$@" 2>&1) || rc=$?
  printf '%s\n' "$out"
  if [ "$rc" -ne 0 ] && grep -Eq "$expected" <<<"$out"; then
    echo "T31 OK red $name: failed as expected (rc=$rc)"
  else
    echo "T31 FAIL red $name: expected a failure with /$expected/ (rc=$rc)"
    status=1
  fi
  echo "T31 RED $name END"
}

teardown() {
  local rc=$? failed=0 ids line
  set +e
  tfail() {
    echo "T31 TEARDOWN FAIL $*"
    failed=1
  }
  if [ -n "$stack_started" ]; then
    api delete "$PROBE_USER" >/dev/null || tfail "delete of the $PROBE_USER workspace through the API"
  fi
  # Before down: a probe workspace still on a stack network (red runs s-row, d-row) would block its removal.
  ids=$(docker ps -aq "${MANAGED[@]}") || tfail "list of t31 workspace containers"
  if [ -n "$ids" ]; then docker rm -f $ids >/dev/null || tfail "docker rm -f of t31 workspace containers"; fi
  "${base[@]}" down --remove-orphans || tfail "compose down --remove-orphans"
  ids=$(docker volume ls -q "${MANAGED[@]}") || tfail "list of t31 workspace volumes"
  if [ -n "$ids" ]; then docker volume rm $ids >/dev/null || tfail "docker volume rm of t31 workspace volumes"; fi
  ids=$(docker network ls -q "${MANAGED[@]}") || tfail "list of t31 workspace networks"
  if [ -n "$ids" ]; then docker network rm $ids >/dev/null || tfail "docker network rm of t31 workspace networks"; fi
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
      if [ $? -ne 0 ] || [ -n "$ids" ]; then tfail "left behind: $kind with $label"; else echo "T31 OK nothing left: $kind with $label"; fi
    done
  done
  if [ -n "$owner_containers" ] || [ -n "$stack_started" ]; then
    if docker volume ls --filter "name=$OWNER_VOLUME" --format '{{.Name}}' | grep -Fx "$OWNER_VOLUME" >/dev/null &&
      docker image ls --format '{{.Repository}}:{{.Tag}}' academy-web | grep -Fx "$OWNER_IMAGE" >/dev/null; then
      echo "T31 OK owner volume and image still there"
    else
      tfail "owner volume $OWNER_VOLUME or image $OWNER_IMAGE missing"
    fi
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      if docker ps -a --filter label=com.docker.compose.project=academy --format '{{.Names}}' | grep -Fx "$line" >/dev/null; then
        echo "T31 OK owner container still there: $line"
      else
        tfail "owner container missing: $line"
      fi
    done <<<"$owner_containers"
  fi
  if [ "$rc" -ne 0 ] || [ "$status" -ne 0 ] || [ "$failed" -ne 0 ]; then
    echo "T31 RESULT FAIL (run rc=$rc, red-run status=$status, teardown failed=$failed)"
    exit 1
  fi
  echo "T31 RESULT OK"
  exit 0
}
trap teardown EXIT

# Guard every file set before any up, including the COMPOSE_FILE form check-image-migrations.sh uses.
guard base "${base[@]}"
guard db-port "${with_port[@]}"
guard db-port-env "${envv[@]}" "COMPOSE_FILE=docker-compose.yml:$OVERRIDE" docker compose
guard no-socket "${no_socket[@]}"

owner_containers=$(snapshot) || { echo "T31 FAIL owner snapshot ($OWNER_VOLUME, $OWNER_IMAGE, project academy)"; exit 1; }
echo "T31 OK owner snapshot taken"

# 16.5 H9: node is pulled only when absent; postgres is never pulled (compose up would, and H9 allows no
# compose pull).
node_id=$(docker image ls --format '{{.ID}}' "$NODE_IMAGE")
postgres_id=$(docker image ls --format '{{.ID}}' "$POSTGRES_IMAGE")
if [ -z "$node_id" ]; then docker pull "$NODE_IMAGE"; fi
if [ -z "$postgres_id" ]; then
  echo "T31 STOP $POSTGRES_IMAGE absent (16.5 H9)"
  exit 1
fi

stack_started=1
"${with_port[@]}" --progress plain up -d --build --wait --wait-timeout 300
curl -fsS -o /dev/null "http://127.0.0.1:$WEB_PORT_T31/"
echo "T31 OK web answers on 127.0.0.1:$WEB_PORT_T31"
api reach
echo "T31 OK workspace service reaches Docker (P7)"
"${envv[@]}" "COMPOSE_FILE=docker-compose.yml:$OVERRIDE" bash apps/web/scripts/check-image-migrations.sh
echo "T31 OK check-image-migrations.sh"
probe "docker-compose.yml:$OVERRIDE" --rows c2
echo "T31 OK probe c2 (db published: the D-row target is reachable, positive control)"

# db recreated without the publish: the default stack the D rows describe.
"${base[@]}" up -d --wait db
probe docker-compose.yml --rows all
echo "T31 OK probe all"

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
echo "T31 OK workspace service reaches Docker again after the red run"
