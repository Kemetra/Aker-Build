"""Entry point for the `aker` command installed by the `aker-build` wheel.

Locate Node, check the floor, exec the vendored bundle, propagate the exit code. The
launcher deliberately does not parse arguments: the CLI owns its own grammar, and a
launcher that interpreted arguments would become a second grammar to keep in sync.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from ._node import NODE_FLOOR, find_node, meets_floor, parse_node_version

_FLOOR_TEXT = f"{NODE_FLOOR[0]}.{NODE_FLOOR[1]}"


def bundle_path() -> Path:
    """The vendored JS bundle shipped inside this package."""
    return Path(__file__).resolve().parent / "vendor" / "aker.js"


def _node_version(executable: str) -> tuple[int, int] | None:
    try:
        result = subprocess.run(
            [executable, "--version"], capture_output=True, text=True, check=False
        )
    except OSError:
        return None
    return parse_node_version(result.stdout or "")


def _fail(message: str) -> int:
    # A missing or outdated prerequisite is a user-fixable condition, not a crash, so
    # it gets a sentence rather than a traceback.
    sys.stderr.write(f"aker: {message}\n")
    return 1


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)

    executable = find_node()
    if executable is None:
        return _fail(
            f"Node.js {_FLOOR_TEXT} or newer is required but `node` was not found on PATH. "
            "Install it from https://nodejs.org and try again."
        )

    version = _node_version(executable)
    if version is None:
        return _fail(
            f"could not read a version from `{executable} --version`; "
            f"Node.js {_FLOOR_TEXT} or newer is required."
        )
    if not meets_floor(version):
        found = f"{version[0]}.{version[1]}"
        return _fail(
            f"Node.js {_FLOOR_TEXT} or newer is required, but {executable} reports {found}."
        )

    bundle = bundle_path()
    if not bundle.is_file():
        return _fail(
            f"the bundled CLI is missing from {bundle}. This wheel was built incorrectly; "
            "please report it at https://github.com/Kemetra/Aker-Build/issues."
        )

    # Inherit stdio so output streams as the child writes it, and forward the exit code
    # verbatim: `aker` uses distinct non-zero codes and each command maps them
    # differently, so normalising here would break scripted use.
    completed = subprocess.run([executable, str(bundle), *args], check=False)
    return completed.returncode


if __name__ == "__main__":  # pragma: no cover - exercised via the console script
    raise SystemExit(main())
