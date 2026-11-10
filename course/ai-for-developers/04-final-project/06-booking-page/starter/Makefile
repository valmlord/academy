# The checks run `make -s build` and then the programs it leaves in bin/; lesson 6 adds the web targets.
.PHONY: build gen
build:
	mkdir -p bin
	cd backend && go build -o ../bin/slots ./cmd/slots
	cd backend && go build -o ../bin/server ./cmd/server

# gen: compile contract/ with the options of the checks, then generate frontend/app/api/schema.d.ts (task.md).
gen:
	@echo "make gen is not written yet" >&2
	@exit 1
