//go:build !linux

package main

// makeNonDumpable has no equivalent outside Linux; the platform runs graders on Linux only, and the
// macOS build exists for local demonstrations of the handshake.
func makeNonDumpable() error { return nil }
