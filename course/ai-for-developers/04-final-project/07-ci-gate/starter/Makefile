# The checks run `make -s build` and then the programs it leaves in bin/; page-ssr runs `make -s build-web`
# and `make -s serve-web` with CALENDAR_API_URL (and HOST, PORT for serve-web) in the environment; ci-gate
# runs `make -s ci` with CALENDAR_NOW, CALENDAR_BOOKING_DELAY_MS and, for its variant runs, CALENDAR_API_URL.
.PHONY: build gen build-web serve-web test-web ci
build:
	mkdir -p bin
	cd backend && go build -o ../bin/slots ./cmd/slots
	cd backend && go build -o ../bin/server ./cmd/server

# TypeSpec resolves @typespec/* from a node_modules at or above contract/ (never inside it: contract-matches refuses
# that). In the workspace image the pinned libraries live in TSP_MODULES; at home point it at your own install.
# The default is the node_modules next to the tsp found in PATH (/opt/academy/bin/tsp -> /opt/academy/node/node_modules).
TSP_MODULES ?= $(abspath $(dir $(shell command -v tsp))../node/node_modules)

# gen: the contract compiled with the options of the checks, then the client types from that document.
gen:
	test -e node_modules || ln -s "$(TSP_MODULES)" node_modules
	tsp compile contract/main.tsp --config contract/tspconfig.yaml --output-dir tsp-output --warn-as-error
	node frontend/node_modules/openapi-typescript/bin/cli.js tsp-output/@typespec/openapi3/openapi.json -o frontend/app/api/schema.d.ts

build-web:
	cd frontend && node node_modules/nuxt/bin/nuxt.mjs build

# The /api proxy target was fixed by build-web; NUXT_API_BASE sets the server-side base again at serve time.
serve-web:
	cd frontend && NUXT_API_BASE="$(CALENDAR_API_URL)" exec node .output/server/index.mjs

test-web:
	cd frontend && node node_modules/vitest/vitest.mjs run

# ci: the one command that runs every check of the repository (task.md lists what it must run).
ci:
	@echo "make ci: nothing is checked yet"
