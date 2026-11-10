# The checks run `make -s build` and then the programs it leaves in bin/.
.PHONY: build
build:
	mkdir -p bin
	cd backend && go build -o ../bin/slots ./cmd/slots
	cd backend && go build -o ../bin/server ./cmd/server
