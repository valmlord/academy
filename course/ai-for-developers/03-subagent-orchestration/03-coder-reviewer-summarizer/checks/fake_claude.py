"""Thin client of the grader's fake `claude` (design #43 revision 6, section 4.2).

The grader writes this file to `<scratch>/bin/claude` with its own interpreter in the shebang and the socket
path substituted. It forwards argv, the cwd, the environment and stdin to the grader over AF_UNIX as one
length-prefixed JSON request. The grader answers with length-prefixed JSON frames: zero or more early frames
`{"stdout": ...}`, each written and flushed at once, then one final frame `{"code", "stdout", "stderr"}`, after
which the client exits with that code. Under stream-json the early frame is the `system/init` line, which the
real CLI also prints before it starts working (hold-and-poll round, L2 B2). The client decides nothing itself.

Every variable is sent with its value, not only the names: C8 forbids adding or changing a variable (PATH
included), and the child environment is built from scratch by the grader, so it holds nothing private.
"""

import base64
import json
import os
import socket
import struct
import sys

SOCKET_PATH = "__ACADEMY_FAKE_SOCKET__"
HEADER = struct.Struct(">I")
# PEP 538: when this interpreter starts under the C locale (no LC_ALL, LANG absent or C/POSIX), it writes
# LC_CTYPE into its own environment. The real `claude` is not a Python program and does not, so a call that
# only removed LANG must not look like one that added LC_CTYPE.
LOCALE_COERCION_TARGETS = ("C.UTF-8", "C.utf8", "UTF-8")
C_LOCALE_NAMES = (None, "", "C", "POSIX")


def received_environment() -> dict[str, str]:
    """The environment the caller passed, without the variable this interpreter added at its own start."""
    environment = dict(os.environ)
    is_c_locale = "LC_ALL" not in environment and environment.get("LANG") in C_LOCALE_NAMES
    if is_c_locale and environment.get("LC_CTYPE") in LOCALE_COERCION_TARGETS:
        del environment["LC_CTYPE"]
    return environment


def read_stdin() -> bytes:
    if sys.stdin is None:
        return b""
    try:
        if sys.stdin.isatty():
            return b""
        return sys.stdin.buffer.read()
    except (OSError, ValueError):
        return b""


def read_exact(connection: socket.socket, size: int) -> bytes:
    chunks = []
    while size:
        chunk = connection.recv(min(size, 1 << 20))
        if not chunk:
            raise ConnectionError("the grader closed the connection")
        chunks.append(chunk)
        size -= len(chunk)
    return b"".join(chunks)


def main() -> int:
    request = {
        "argv": sys.argv,
        "argv0": os.path.realpath(sys.argv[0]),
        "cwd": os.path.realpath(os.getcwd()),
        "env": received_environment(),
        "stdin": base64.b64encode(read_stdin()).decode("ascii"),
    }
    body = json.dumps(request).encode("utf-8")
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.connect(SOCKET_PATH)
            connection.sendall(HEADER.pack(len(body)) + body)
            while True:
                (size,) = HEADER.unpack(read_exact(connection, HEADER.size))
                reply = json.loads(read_exact(connection, size).decode("utf-8"))
                if "code" in reply:
                    break
                sys.stdout.write(reply["stdout"])
                sys.stdout.flush()
    except (OSError, ValueError, KeyError) as error:
        sys.stderr.write(f"claude: the grading service is not reachable ({error})\n")
        return 1
    sys.stdout.write(reply["stdout"])
    sys.stdout.flush()
    sys.stderr.write(reply["stderr"])
    sys.stderr.flush()
    return int(reply["code"])


if __name__ == "__main__":
    sys.exit(main())
