"""Text helpers for scripts/check_artifacts.py: the tokenizer and the fence scanner of the exercise.

Ready to use; the rules C1-C6 are yours to write. Standard library only.
"""

import re

TOKEN = re.compile(r"[A-Za-z]+")
FENCE_OPEN = re.compile(r"^ {0,3}(`{3,}|~{3,})")


def normalize_newlines(text: str) -> str:
    """`\\r\\n` and `\\r` become `\\n`, so `text.split("\\n")` gives the lines of any file."""
    return text.replace("\r\n", "\n").replace("\r", "\n")


def tokens(text: str) -> list[str]:
    """Maximal runs of ASCII letters, lower-cased, in order of appearance.

    Cyrillic, digits, `_` and punctuation are boundaries: `billing` is one token, `clientId` is
    `clientid`, a Russian sentence with `client` in it gives `client`, and `test_req_01_client2`
    gives `test`, `req`, `client`.
    """
    return [token.lower() for token in TOKEN.findall(text)]


def token_matches(token: str, avoid_word: str) -> bool:
    """A token matches an `_Avoid_` word `w` when it equals `w`, `w + "s"` or `w + "es"`:
    `clients` matches `client`, `billing` does not match `bill`."""
    word = avoid_word.lower()
    return token in (word, word + "s", word + "es")


def fenced_line_flags(lines: list[str]) -> list[bool]:
    """One flag per line: True for a fence line and every line inside a fenced code block.

    A line whose first non-space character, after at most 3 spaces, starts a run of >= 3 backticks
    or >= 3 tildes opens a fence; a line of the same character, at least as long, closes it; an
    unclosed fence runs to the end of the file.
    """
    flags: list[bool] = []
    fence_char = ""
    fence_len = 0
    for line in lines:
        if fence_char:
            flags.append(True)
            stripped = line.strip(" ")
            if (
                len(line) - len(line.lstrip(" ")) <= 3
                and stripped
                and set(stripped) == {fence_char}
                and len(stripped) >= fence_len
            ):
                fence_char = ""
            continue
        opening = FENCE_OPEN.match(line)
        if opening:
            fence_char = opening.group(1)[0]
            fence_len = len(opening.group(1))
            flags.append(True)
            continue
        flags.append(False)
    return flags
