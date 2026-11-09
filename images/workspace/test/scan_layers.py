#!/usr/bin/env python3
"""Prove that no planted canary reached any layer, the history or the config of a workspace image.

  python3 -I images/workspace/test/scan_layers.py <image> <canary> [--budget <bytes>]

Streams `docker save <image>` (no temp file), decompresses every layer blob (every member of a multi-member gzip)
and searches each blob for the canary; configs and manifests are searched raw. A scan of a file that was added
and deleted in a later layer still sees it, which a search of an exported filesystem would not.

Output lines, each OK or FAIL: "LAYER canary <member>", "COVERAGE expected=<m> missing=<k>" (every diff id of
RootFS.Layers was decompressed), "CONTROL" (the learner passwd line was found, so the scan really read layer
content), "SIZE bytes=<n> budget=<b>", "HISTORY canary", "HISTORY control", "CONFIG canary", "CONFIG key"; plus
"INFO size=<n>" (store-dependent, not a check) and "SCAN FAIL <reason>" when a stream cannot be read. The canary
itself is never printed.

Exit codes: 0 every line OK; 1 any FAIL; 2 usage, or Docker returned JSON of an unexpected shape.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import tarfile
import zlib
from typing import IO, Dict, Iterable, Iterator, List, NamedTuple, Optional, Sequence, Set, Tuple

# Design #33 4.2: about 1.0-1.2 GB of layers are expected (base, apt, Go, Node, Claude Code, the TypeSpec tree);
# 1.3 GB leaves room for normal version bumps and still fails on a doubled layer or a cache left behind.
LAYER_BYTES_BUDGET = 1_300_000_000
CHUNK_BYTES = 1024 * 1024
# The learner's passwd entry: present in exactly one layer of every correct image (the identity step).
CONTROL_NEEDLE = b"learner:x:1000:1000:learner:/workspace/home:/bin/bash"
# The image's own ENV line, present in every history.
HISTORY_CONTROL = "DISABLE_AUTOUPDATER"
GZIP_MAGIC = b"\x1f\x8b"
ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"
MAGIC_PEEK_BYTES = 4
# 32 + 15: a gzip (or zlib) header, the largest window.
GZIP_WBITS = 47
DIFF_ID_RE = re.compile(r"sha256:[0-9a-f]{64}")


class ScanError(Exception):
    """A blob could not be read completely; the scan fails closed instead of reporting a short, clean image."""


class DockerShapeError(Exception):
    """Docker printed JSON that is not what the scan relies on."""


class MemberScan(NamedTuple):
    name: str
    digest: str
    size: int
    has_canary: bool
    has_control: bool


class NeedleSearch:
    """Finds needles in a stream of chunks, including a needle that straddles two chunks."""

    def __init__(self, needles: Sequence[bytes]) -> None:
        if not needles or any(not needle for needle in needles):
            raise ValueError("every needle must be non-empty")
        self._needles = list(needles)
        # A needle split across a boundary has at most len - 1 bytes before it.
        self._overlap = max(len(needle) for needle in needles) - 1
        self._tail = b""
        self.found = [False] * len(needles)

    def feed(self, chunk: bytes) -> None:
        window = self._tail + chunk
        for index, needle in enumerate(self._needles):
            if not self.found[index] and needle in window:
                self.found[index] = True
        self._tail = window[-self._overlap:] if self._overlap else b""


def _with_head(chunks: Iterator[bytes]) -> Tuple[bytes, Iterator[bytes]]:
    """The first MAGIC_PEEK_BYTES or more of the stream (fewer only when the stream is shorter), and the rest."""
    head = b""
    for chunk in chunks:
        head += chunk
        if len(head) >= MAGIC_PEEK_BYTES:
            break
    return head, chunks


def _prepend(first: bytes, rest: Iterator[bytes]) -> Iterator[bytes]:
    if first:
        yield first
    yield from rest


def _gunzip_all_members(chunks: Iterable[bytes], member: str) -> Iterator[bytes]:
    # A blob may hold several concatenated gzip members (Go's gzip.Reader, which computes diff ids, reads them
    # all); one decompressobj stops after the first and would never see a canary in the second.
    decompressor = zlib.decompressobj(wbits=GZIP_WBITS)
    is_fed = False
    for chunk in chunks:
        data = chunk
        while data:
            is_fed = True
            try:
                out = decompressor.decompress(data)
            except zlib.error as error:
                raise ScanError(f"bad gzip stream in {member}: {error}") from error
            if out:
                yield out
            if decompressor.eof:
                data = decompressor.unused_data
                decompressor = zlib.decompressobj(wbits=GZIP_WBITS)
                is_fed = False
            else:
                data = b""
    if is_fed:
        raise ScanError(f"bad gzip stream in {member}: truncated member")


def decompressed(chunks: Iterable[bytes], member: str) -> Iterator[bytes]:
    """The content of a blob: gzip decompressed, raw otherwise; zstd fails closed (the scan cannot read it)."""
    head, rest = _with_head(iter(chunks))
    if head.startswith(ZSTD_MAGIC):
        raise ScanError(f"unsupported compression (zstd) in {member}")
    if head.startswith(GZIP_MAGIC):
        return _gunzip_all_members(_prepend(head, rest), member)
    return _prepend(head, rest)


def scan_member(chunks: Iterable[bytes], member: str, canary: bytes) -> MemberScan:
    """Digest, size and needle hits of one blob's content; the digest of a layer blob is its diff id."""
    digest = hashlib.sha256()
    size = 0
    search = NeedleSearch([canary, CONTROL_NEEDLE])
    for chunk in decompressed(chunks, member):
        digest.update(chunk)
        size += len(chunk)
        search.feed(chunk)
    return MemberScan(member, "sha256:" + digest.hexdigest(), size, search.found[0], search.found[1])


def _file_chunks(handle: IO[bytes]) -> Iterator[bytes]:
    while True:
        chunk = handle.read(CHUNK_BYTES)
        if not chunk:
            return
        yield chunk


def scan_tar(stream: IO[bytes], canary: bytes) -> List[MemberScan]:
    """Scans every regular member of a tar stream, in order, without seeking."""
    scans: List[MemberScan] = []
    try:
        with tarfile.open(fileobj=stream, mode="r|") as archive:
            for info in archive:
                if not info.isfile():
                    continue
                handle = archive.extractfile(info)
                if handle is None:
                    raise ScanError(f"cannot read {info.name} from the archive")
                scans.append(scan_member(_file_chunks(handle), info.name, canary))
    except tarfile.TarError as error:
        raise ScanError(f"bad tar stream from docker save: {error}") from error
    return scans


def missing_diff_ids(expected: Iterable[str], scans: Iterable[MemberScan]) -> Set[str]:
    # A set on both sides: an image may list one diff id twice (two identical layers), and docker save writes one
    # blob for it, so comparing counts would fail a correct image.
    return set(expected) - {scan.digest for scan in scans}


def layer_bytes(expected: Iterable[str], scans: Iterable[MemberScan]) -> int:
    """The uncompressed size of the distinct layers, each counted once however many blobs carry it."""
    wanted = set(expected)
    sizes: Dict[str, int] = {scan.digest: scan.size for scan in scans if scan.digest in wanted}
    return sum(sizes.values())


def parse_diff_ids(text: str) -> List[str]:
    value: object = json.loads(text)
    if not isinstance(value, list) or not value:
        raise DockerShapeError(f"RootFS.Layers is not a non-empty JSON list: {text.strip()[:200]}")
    diff_ids: List[str] = []
    for item in value:
        if not isinstance(item, str) or not DIFF_ID_RE.fullmatch(item):
            raise DockerShapeError(f"RootFS.Layers holds {item!r}, not a sha256:<64 hex> diff id")
        diff_ids.append(item)
    return diff_ids


def env_has_anthropic_variable(config_text: str) -> bool:
    config: object = json.loads(config_text)
    if not isinstance(config, dict):
        raise DockerShapeError("Config is not a JSON object")
    env: object = config.get("Env")
    if env is None:
        return False
    if not isinstance(env, list) or not all(isinstance(entry, str) for entry in env):
        raise DockerShapeError("Config.Env is not a list of strings")
    return any(isinstance(entry, str) and entry.startswith("ANTHROPIC_") for entry in env)


def _docker(args: Sequence[str]) -> str:
    completed = subprocess.run(["docker", *args], check=False, capture_output=True, text=True)
    if completed.returncode != 0:
        raise DockerShapeError(f"docker {args[0]} {args[1]} exited {completed.returncode}: {completed.stderr.strip()}")
    return completed.stdout


def _line(name: str, is_ok: bool, detail: str = "") -> bool:
    print(f"{name} {'OK' if is_ok else 'FAIL'}{(' ' + detail) if detail else ''}")
    return is_ok


def _save_and_scan(image: str, canary: bytes) -> Optional[List[MemberScan]]:
    process = subprocess.Popen(["docker", "save", image], stdout=subprocess.PIPE)
    stdout = process.stdout
    if stdout is None:
        raise RuntimeError("subprocess.Popen with stdout=PIPE returned no stdout")
    try:
        scans = scan_tar(stdout, canary)
        # The end-of-archive blocks may still be in the pipe; drain them so docker save can exit.
        for _ in _file_chunks(stdout):
            pass
    except ScanError as error:
        process.kill()
        process.wait()
        print(f"SCAN FAIL {error}")
        return None
    finally:
        stdout.close()
    returncode = process.wait()
    if returncode != 0:
        # A truncated stream would otherwise look like a short, clean image.
        print(f"SCAN FAIL docker save exited {returncode}")
        return None
    return scans


def main(argv: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(description="Scan a workspace image for a planted canary.")
    parser.add_argument("image")
    parser.add_argument("canary")
    parser.add_argument("--budget", type=int, default=LAYER_BYTES_BUDGET)
    args = parser.parse_args(argv)
    image: str = args.image
    canary_text: str = args.canary
    budget: int = args.budget
    if not canary_text:
        print("scan_layers: the canary must be non-empty", file=sys.stderr)
        return 2
    canary = canary_text.encode()

    try:
        diff_ids = parse_diff_ids(_docker(["image", "inspect", "--format", "{{json .RootFS.Layers}}", image]))
        history = _docker(["history", "--no-trunc", "--format", "{{.CreatedBy}}", image])
        config_text = _docker(["image", "inspect", "--format", "{{json .Config}}", image])
        has_key = env_has_anthropic_variable(config_text)
        store_size = _docker(["image", "inspect", "--format", "{{.Size}}", image]).strip()
    except (DockerShapeError, json.JSONDecodeError) as error:
        print(f"scan_layers: {error}", file=sys.stderr)
        return 2

    scans = _save_and_scan(image, canary)
    if scans is None:
        return 1
    results: List[bool] = []
    for scan in scans:
        results.append(_line("LAYER canary", not scan.has_canary, scan.name))
    expected = set(diff_ids)
    missing = missing_diff_ids(expected, scans)
    results.append(_line("COVERAGE", not missing, f"expected={len(expected)} missing={len(missing)}"))
    results.append(_line("CONTROL", any(scan.has_control for scan in scans)))
    total = layer_bytes(expected, scans)
    results.append(_line("SIZE", total <= budget, f"bytes={total} budget={budget}"))
    results.append(_line("HISTORY canary", canary_text not in history))
    results.append(_line("HISTORY control", HISTORY_CONTROL in history))
    results.append(_line("CONFIG canary", canary_text not in config_text))
    results.append(_line("CONFIG key", not has_key))
    print(f"INFO size={store_size}")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
