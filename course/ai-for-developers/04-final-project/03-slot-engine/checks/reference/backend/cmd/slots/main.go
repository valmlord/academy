// Command slots is the engine seam the checks call: one JSON request per input line, one JSON answer
// per output line, in the same order.
//
// Input line:  the "request" object of the case format, {now, schedule, eventType, bookings, from, to}.
// Output line: {"items":[{"start":"...","end":"..."}, ...]}, or {"error":"..."} when the engine fails.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"

	"calendar/internal/slots"
)

// maxLineBytes bounds one request line; a case file is at most 64 KB.
const maxLineBytes = 1 << 20

type answer struct {
	Items []slots.Slot `json:"items"`
}

type failure struct {
	Error string `json:"error"`
}

func main() {
	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 0, 64*1024), maxLineBytes)
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()
	encoder := json.NewEncoder(out)
	for in.Scan() {
		if len(in.Bytes()) == 0 {
			continue
		}
		if err := encoder.Encode(respond(in.Bytes())); err != nil {
			fmt.Fprintln(os.Stderr, "slots: write:", err)
			os.Exit(1)
		}
		if err := out.Flush(); err != nil {
			fmt.Fprintln(os.Stderr, "slots: flush:", err)
			os.Exit(1)
		}
	}
	if err := in.Err(); err != nil {
		fmt.Fprintln(os.Stderr, "slots: read:", err)
		os.Exit(1)
	}
}

func respond(line []byte) any {
	var req slots.Request
	if err := json.Unmarshal(line, &req); err != nil {
		return failure{Error: "request: " + err.Error()}
	}
	items, err := slots.Available(req)
	if err != nil {
		return failure{Error: err.Error()}
	}
	if items == nil {
		items = []slots.Slot{}
	}
	return answer{Items: items}
}
