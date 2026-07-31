"""Locating Node and checking its version.

Pure logic, deliberately free of side effects apart from `find_node`, so the version
rules can be tested without a Node installation.
"""

from __future__ import annotations

import re
import shutil

# Matches engines.node (">=22.13") in the generated npm manifest. A mismatch between
# the two channels would let pip install a combination npm refuses.
NODE_FLOOR = (22, 13)

_VERSION = re.compile(r"^v?(\d+)\.(\d+)")


def parse_node_version(text: str) -> tuple[int, int] | None:
    """Read (major, minor) from `node --version` output, or None if unrecognisable.

    Returning None rather than guessing matters: a launcher that assumed a version it
    could not read would run the bundle on an unknown runtime.
    """
    match = _VERSION.match(text.strip())
    if match is None:
        return None
    return (int(match.group(1)), int(match.group(2)))


def meets_floor(version: tuple[int, int], floor: tuple[int, int] = NODE_FLOOR) -> bool:
    """Compare as integer tuples.

    String comparison would rank "9" above "22" because '9' > '2', so a lexical check
    silently accepts Node 9.
    """
    return version >= floor


def find_node() -> str | None:
    """Absolute path to the `node` executable, or None when it is not on PATH."""
    return shutil.which("node")
