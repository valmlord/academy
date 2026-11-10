//go:build linux

package main

import "syscall"

// prSetDumpable is PR_SET_DUMPABLE from <linux/prctl.h>.
const prSetDumpable = 4

// makeNonDumpable runs before the handshake: after it, a same-uid process can no longer open this
// process's /proc entries (fd, mem, environ) or attach ptrace (design 7.5).
func makeNonDumpable() error {
	_, _, errno := syscall.RawSyscall(syscall.SYS_PRCTL, prSetDumpable, 0, 0)
	if errno != 0 {
		return errno
	}
	return nil
}
