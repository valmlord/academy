// Command server is the HTTP API of the booking calendar (the contract in contract/).
//
// Environment (task.md): HOST and PORT to listen on, CALENDAR_NOW as the current moment in RFC 3339,
// CALENDAR_DATA_DIR for any files the server keeps.
package main

import (
	"errors"
	"log"
	"net"
	"net/http"
	"os"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	host, port := os.Getenv("HOST"), os.Getenv("PORT")
	if port == "" {
		return errors.New("PORT is not set")
	}
	mux := http.NewServeMux()
	// The operations of the contract are registered on mux here.
	address := net.JoinHostPort(host, port)
	log.Printf("listening on %s", address)
	return http.ListenAndServe(address, mux)
}
