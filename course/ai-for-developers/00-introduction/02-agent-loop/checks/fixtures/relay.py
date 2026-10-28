"""Thin stdio relay: forwards each JSON-RPC line to the grader over a private socket.

It holds no tool logic and no answers: the grader computes every tools/list and tools/call
reply at call time, so importing or copying this file gives a harness nothing.
"""

import json
import socket
import sys


def main(socket_path: str) -> None:
    conn = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    conn.connect(socket_path)
    stream = conn.makefile("rw", encoding="utf-8", newline="\n")
    stream.write(json.dumps({"hello": "relay"}) + "\n")
    stream.flush()
    if not stream.readline():
        return
    for line in sys.stdin:
        if not line.strip():
            continue
        stream.write(json.dumps({"op": "rpc", "line": line.rstrip("\n")}) + "\n")
        stream.flush()
        reply = stream.readline()
        if not reply:
            return
        sys.stdout.write(json.loads(reply)["line"] + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main(sys.argv[1])
