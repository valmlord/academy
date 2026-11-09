"""Docker-free tests of the scan core of scan_layers.py, over in-memory tar streams like docker save writes."""
import gzip
import hashlib
import io
import os
import sys
import tarfile
import unittest
from typing import List, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scan_layers  # noqa: E402

CANARY = b"academy-canary-0123456789abcdef0123456789abcdef"


def tar_stream(members: List[Tuple[str, bytes]]) -> io.BytesIO:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        for name, data in members:
            info = tarfile.TarInfo(name)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
    buffer.seek(0)
    return buffer


def layer_tar(files: List[Tuple[str, bytes]]) -> bytes:
    return tar_stream(files).getvalue()


def sha256_id(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


class CanarySearchTest(unittest.TestCase):
    def test_canary_in_raw_member_is_found(self) -> None:
        stream = tar_stream([("blobs/sha256/raw", layer_tar([("etc/leak", CANARY)]))])

        scans = scan_layers.scan_tar(stream, CANARY)

        self.assertEqual([scan.has_canary for scan in scans], [True])

    def test_canary_in_gzip_member_is_found(self) -> None:
        stream = tar_stream([("blobs/sha256/gz", gzip.compress(layer_tar([("etc/leak", CANARY)])))])

        scans = scan_layers.scan_tar(stream, CANARY)

        self.assertEqual([scan.has_canary for scan in scans], [True])

    def test_canary_in_second_gzip_member_is_found(self) -> None:
        blob = gzip.compress(b"first member, clean\n") + gzip.compress(b"second member " + CANARY)
        stream = tar_stream([("blobs/sha256/multi", blob)])

        scans = scan_layers.scan_tar(stream, CANARY)

        self.assertEqual([scan.has_canary for scan in scans], [True])

    def test_canary_across_chunk_boundary_is_found(self) -> None:
        split_at = scan_layers.CHUNK_BYTES - len(CANARY) // 2
        data = b"\0" * split_at + CANARY + b"\0" * scan_layers.CHUNK_BYTES
        stream = tar_stream([("blobs/sha256/boundary", data)])

        scans = scan_layers.scan_tar(stream, CANARY)

        self.assertEqual([scan.has_canary for scan in scans], [True])

    def test_clean_member_reports_no_canary(self) -> None:
        stream = tar_stream([("blobs/sha256/clean", gzip.compress(layer_tar([("etc/hostname", b"x\n")])))])

        scans = scan_layers.scan_tar(stream, CANARY)

        self.assertEqual([scan.has_canary for scan in scans], [False])


class FailClosedTest(unittest.TestCase):
    def test_trailing_garbage_after_gzip_fails_closed(self) -> None:
        stream = tar_stream([("blobs/sha256/garbage", gzip.compress(b"layer") + b"not a gzip header")])

        with self.assertRaisesRegex(scan_layers.ScanError, "bad gzip stream in blobs/sha256/garbage"):
            scan_layers.scan_tar(stream, CANARY)

    def test_truncated_gzip_fails_closed(self) -> None:
        whole = gzip.compress(b"layer content " * 1000)
        stream = tar_stream([("blobs/sha256/truncated", whole[: len(whole) // 2])])

        with self.assertRaisesRegex(scan_layers.ScanError, "truncated member"):
            scan_layers.scan_tar(stream, CANARY)

    def test_zstd_member_fails_closed(self) -> None:
        stream = tar_stream([("blobs/sha256/zstd", scan_layers.ZSTD_MAGIC + b"\0" * 64)])

        with self.assertRaisesRegex(scan_layers.ScanError, r"unsupported compression \(zstd\)"):
            scan_layers.scan_tar(stream, CANARY)


class CoverageTest(unittest.TestCase):
    def test_diff_id_of_multi_member_layer_is_sha256_of_all_members(self) -> None:
        content = layer_tar([("usr/bin/tool", b"a" * 5000), ("etc/conf", b"b" * 3000)])
        middle = len(content) // 2
        blob = gzip.compress(content[:middle]) + gzip.compress(content[middle:])
        stream = tar_stream([("blobs/sha256/layer", blob)])

        scans = scan_layers.scan_tar(stream, CANARY)

        self.assertEqual(scans[0].digest, sha256_id(content))
        self.assertEqual(scans[0].size, len(content))

    def test_duplicate_diff_ids_cover_with_one_blob(self) -> None:
        first = layer_tar([("a", b"first")])
        second = layer_tar([("b", b"second")])
        stream = tar_stream([("blobs/sha256/one", first), ("blobs/sha256/two", gzip.compress(second))])
        expected = [sha256_id(first), sha256_id(second), sha256_id(first)]

        scans = scan_layers.scan_tar(stream, CANARY)

        self.assertEqual(scan_layers.missing_diff_ids(expected, scans), set())
        self.assertEqual(scan_layers.layer_bytes(expected, scans), len(first) + len(second))

    def test_missing_layer_reports_coverage_fail(self) -> None:
        present = layer_tar([("a", b"present")])
        absent = layer_tar([("b", b"never saved")])
        stream = tar_stream([("blobs/sha256/one", present), ("index.json", b"{}")])

        scans = scan_layers.scan_tar(stream, CANARY)

        self.assertEqual(scan_layers.missing_diff_ids([sha256_id(present), sha256_id(absent)], scans),
                         {sha256_id(absent)})


if __name__ == "__main__":
    unittest.main()
