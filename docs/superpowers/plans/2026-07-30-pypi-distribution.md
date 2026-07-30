# PyPI Distribution Implementation Plan (Spec 020)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pip install aker-build` provides a working `aker` command, by wrapping the existing compiled JS bundle in a single universal wheel — with no Python reimplementation of the engine.

**Architecture:** A hatchling build hook copies `packages/cli/dist/npm/dist/aker.js` into `python/aker_build/vendor/` at build time; a thin launcher locates Node, checks the version floor, and execs the bundle with argv and exit code forwarded verbatim. Wheel metadata version is read directly from the committed `packages/cli/src/version.ts`, so npm and PyPI cannot drift.

**Tech Stack:** Python 3.9+ (`shutil.which`, `subprocess`), hatchling build backend, `python -m build` 1.4.2, `twine` 6.2.0, pytest, GitHub Actions OIDC Trusted Publishing.

## Global Constraints

- Read `docs/superpowers/specs/2026-07-30-pypi-distribution-design.md` first; it is the authority for scope.
- **The TypeScript engine stays the only source of truth.** No engine logic in Python.
- Package name is `aker-build`; the installed command is `aker`. Ship exactly one console script.
- Node is a **runtime** prerequisite, never a Python dependency. The wheel does not carry a Node runtime.
- Version comes from `CLI_VERSION` in `packages/cli/src/version.ts` (currently `0.1.0`). Never hard-code it in Python.
- Node floor is `>=22.13`, matching `engines.node` in the generated npm manifest.
- Add no new Python runtime dependency. The launcher uses only the standard library.
- **Do not publish**, and do not commit, push, or open a PR unless the operator explicitly requests it.
- Do not modify `pnpm-lock.yaml`. If a command dirties it, `git checkout pnpm-lock.yaml`.
- Never use `git add -A` or `git add .`; stage named files only.
- Commit signing is disabled for this work by operator authorization (`git -c commit.gpgsign=false`).
- The workflow file MUST be named `pypi-release.yml` — PyPI's registered Trusted Publisher matches the filename exactly and rejects a mismatch.

## File Structure

| Path | Responsibility |
|---|---|
| `python/pyproject.toml` | Package metadata, version source, console script, build hook config |
| `python/aker_build/__init__.py` | Package marker; exposes `__version__` |
| `python/aker_build/_node.py` | Pure helpers: find Node, parse and compare versions |
| `python/aker_build/__main__.py` | The launcher: locate → verify → exec → propagate |
| `python/hatch_build.py` | Build hook copying the vendored bundle and notices |
| `python/tests/test_node.py` | Version parsing and comparison, including the string-compare trap |
| `python/tests/test_launcher.py` | argv forwarding and exit-code propagation against a stub Node |
| `python/tests/test_packaging.py` | Wheel contents, version sync, one console script |
| `python/README.md` | PyPI long description |
| `.github/workflows/pypi-release.yml` | Manual, environment-gated OIDC publish |
| `.github/workflows/aker-build.yml` | Add a Python test job on the Ubuntu + Windows matrix |
| `.gitignore` | Ignore `python/aker_build/vendor/`, `python/dist/` |

Task 1 builds the pure version logic (no filesystem, no subprocess). Task 2 builds the launcher against a stub Node. Task 3 adds packaging and the build hook. Task 4 proves a clean-venv install. Task 5 wires CI and the release workflow. Task 6 documents.

---

### Task 1: Node discovery and version comparison

**Files:**
- Create: `python/aker_build/__init__.py`
- Create: `python/aker_build/_node.py`
- Test: `python/tests/test_node.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `NODE_FLOOR = (22, 13)`, `parse_node_version(text) -> tuple[int, int] | None`, `meets_floor(version, floor=NODE_FLOOR) -> bool`, `find_node() -> str | None`.

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_node.py`:

```python
import pytest

from aker_build._node import (
    NODE_FLOOR,
    meets_floor,
    parse_node_version,
)


def test_parses_a_standard_node_version_string():
    assert parse_node_version("v22.14.0\n") == (22, 14)
    assert parse_node_version("v22.13.0") == (22, 13)


def test_returns_none_for_unparseable_output():
    # A launcher that guessed here would run on an unknown runtime.
    assert parse_node_version("") is None
    assert parse_node_version("not a version") is None
    assert parse_node_version("v") is None


def test_floor_comparison_is_numeric_not_lexical():
    # The trap this exists to avoid: string comparison ranks "9" above "22",
    # because '9' > '2' lexically, so a naive check would accept Node 9.
    assert meets_floor((9, 99)) is False
    assert meets_floor((22, 13)) is True
    assert meets_floor((22, 12)) is False
    assert meets_floor((24, 0)) is True
    assert meets_floor((20, 11)) is False


def test_floor_matches_the_npm_engines_field():
    # Drift between the two channels' floors would let pip install a combination
    # npm refuses.
    assert NODE_FLOOR == (22, 13)


@pytest.mark.parametrize("text", ["v22.13", "22.13.0"])
def test_tolerates_missing_prefix_or_patch(text):
    assert parse_node_version(text) == (22, 13)
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd python && python -m pytest tests/test_node.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'aker_build'`.

- [ ] **Step 3: Write the minimal implementation**

Create `python/aker_build/__init__.py`:

```python
"""Python launcher for the Aker Build CLI.

The engine is TypeScript, compiled to a single JavaScript bundle and vendored into
this wheel at build time. Nothing here reimplements it; this package exists only so
Python-first toolchains can install the CLI through the dependency path they already
use.
"""

__all__ = ["__version__"]

# Kept in sync with packages/cli/src/version.ts by the build; see pyproject.toml.
__version__ = "0.1.0"
```

Create `python/aker_build/_node.py`:

```python
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd python && python -m pytest tests/test_node.py -q
```

Expected: PASS, 6 tests (the parametrize contributes 2).

- [ ] **Step 5: Commit**

```bash
git add python/aker_build/__init__.py python/aker_build/_node.py python/tests/test_node.py
git -c commit.gpgsign=false commit -m "feat(python): add Node discovery and a numeric version floor"
```

---

### Task 2: The launcher

**Files:**
- Create: `python/aker_build/__main__.py`
- Test: `python/tests/test_launcher.py`

**Interfaces:**
- Consumes: `find_node`, `parse_node_version`, `meets_floor`, `NODE_FLOOR` from `._node`.
- Produces: `main(argv: list[str] | None = None) -> int`, `bundle_path() -> Path`.

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_launcher.py`:

```python
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

from aker_build.__main__ import bundle_path, main


@pytest.fixture()
def stub_bundle(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A tiny JS file standing in for the 620 KB bundle.

    Using a stub keeps these tests fast and independent of whether the JS build has
    run — the launcher's contract is argv in, exit code out, and that does not depend
    on which script it executes.
    """
    stub = tmp_path / "aker.js"
    stub.write_text(
        "\n".join(
            [
                "const args = process.argv.slice(2);",
                "process.stdout.write(JSON.stringify(args));",
                "if (args[0] === 'boom') process.exit(3);",
                "if (args[0] === 'nope') process.exit(1);",
                "process.exit(0);",
            ]
        ),
        encoding="utf8",
    )
    monkeypatch.setattr("aker_build.__main__.bundle_path", lambda: stub)
    return stub


def run_main(argv: list[str], capfd) -> tuple[int, str]:
    code = main(argv)
    out, _ = capfd.readouterr()
    return code, out


def test_forwards_arguments_unmodified(stub_bundle, capfd):
    code, out = run_main(["route", ".", "--stdout", "--format", "json"], capfd)
    assert code == 0
    assert '["route",".","--stdout","--format","json"]' in out.replace(" ", "")


def test_forwards_an_argument_containing_spaces_as_one_argument(stub_bundle, capfd):
    # The Windows console-script wrapper is where this breaks; a re-split path would
    # arrive as two arguments.
    code, out = run_main(["scan", "some path with spaces"], capfd)
    assert code == 0
    assert "some path with spaces" in out


def test_propagates_a_nonzero_exit_code_verbatim(stub_bundle, capfd):
    assert run_main(["boom"], capfd)[0] == 3
    assert run_main(["nope"], capfd)[0] == 1


def test_reports_missing_node_without_a_traceback(monkeypatch, capsys):
    monkeypatch.setattr("aker_build.__main__.find_node", lambda: None)
    code = main(["--version"])
    err = capsys.readouterr().err
    assert code != 0
    assert "Node.js" in err
    assert "22.13" in err
    assert "Traceback" not in err


def test_reports_an_old_node_with_the_version_it_found(monkeypatch, capsys):
    monkeypatch.setattr("aker_build.__main__.find_node", lambda: "/usr/bin/node")
    monkeypatch.setattr("aker_build.__main__._node_version", lambda _exe: (20, 11))
    code = main(["--version"])
    err = capsys.readouterr().err
    assert code != 0
    assert "20.11" in err
    assert "22.13" in err


def test_bundle_path_points_inside_the_installed_package():
    assert bundle_path().name == "aker.js"
    assert bundle_path().parent.name == "vendor"
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd python && python -m pytest tests/test_launcher.py -q
```

Expected: FAIL — no module `aker_build.__main__`.

- [ ] **Step 3: Write the minimal implementation**

Create `python/aker_build/__main__.py`:

```python
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd python && python -m pytest tests/test_launcher.py -q
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add python/aker_build/__main__.py python/tests/test_launcher.py
git -c commit.gpgsign=false commit -m "feat(python): add the launcher forwarding argv and exit codes"
```

---

### Task 3: Packaging and the build hook

**Files:**
- Create: `python/pyproject.toml`
- Create: `python/hatch_build.py`
- Create: `python/README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the package from Tasks 1–2.
- Produces: a buildable `python/` project whose wheel contains `aker_build/vendor/aker.js`.

- [ ] **Step 1: Write the build hook**

Create `python/hatch_build.py`:

```python
"""Copy the compiled JS bundle into the package before the wheel is built.

The bundle is generated from TypeScript by `pnpm build:cli-package`. Copying it here
rather than committing it keeps one source of truth: the wheel cannot ship a stale
engine, because there is no checked-in copy to go stale.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
ARTIFACT = REPO / "packages" / "cli" / "dist" / "npm"
VENDOR = HERE / "aker_build" / "vendor"

COPIES = [
    (ARTIFACT / "dist" / "aker.js", VENDOR / "aker.js"),
    (ARTIFACT / "THIRD_PARTY_NOTICES.txt", VENDOR / "THIRD_PARTY_NOTICES.txt"),
]


class VendorBundleHook(BuildHookInterface):
    PLUGIN_NAME = "vendor-bundle"

    def initialize(self, version: str, build_data: dict) -> None:
        # An sdist built from a clean checkout already carries vendor/, so a missing
        # artifact is only an error when there is nothing vendored to fall back on.
        if all(destination.is_file() for _, destination in COPIES):
            if not (ARTIFACT / "dist" / "aker.js").is_file():
                return

        missing = [str(source) for source, _ in COPIES if not source.is_file()]
        if missing:
            raise RuntimeError(
                "the compiled CLI bundle is missing; run `pnpm build:cli-package` "
                f"from the repository root first. Not found: {', '.join(missing)}"
            )

        VENDOR.mkdir(parents=True, exist_ok=True)
        for source, destination in COPIES:
            shutil.copy2(source, destination)
```

- [ ] **Step 2: Write pyproject.toml**

Create `python/pyproject.toml`:

```toml
[build-system]
requires = ["hatchling>=1.21"]
build-backend = "hatchling.build"

[project]
name = "aker-build"
description = "CLI-first SaaS Build Kernel — scan, gate, queue, and route the next safest task"
readme = "README.md"
license = { text = "MIT" }
requires-python = ">=3.9"
dynamic = ["version"]
keywords = ["cli", "saas", "architecture", "code-review", "static-analysis"]
classifiers = [
  "Development Status :: 4 - Beta",
  "Environment :: Console",
  "Intended Audience :: Developers",
  "License :: OSI Approved :: MIT License",
  "Programming Language :: Python :: 3",
  "Topic :: Software Development :: Quality Assurance",
]

# The package is `aker-build`; the command it installs is `aker`. Exactly one console
# script: nothing is published yet, so there is no prior name to stay compatible with.
[project.scripts]
aker = "aker_build.__main__:main"

[project.urls]
Homepage = "https://github.com/Kemetra/Aker-Build"
Issues = "https://github.com/Kemetra/Aker-Build/issues"

# Read the version straight from the TypeScript constant that the npm build also reads,
# so the two registries cannot drift. version.ts is committed, which matters: the
# generated npm manifest does not exist in a fresh clone, so metadata resolution would
# fail before the build hook could run.
[tool.hatch.version]
path = "../packages/cli/src/version.ts"
pattern = 'CLI_VERSION\s*=\s*"(?P<version>[^"]+)"'

[tool.hatch.build.targets.wheel]
packages = ["aker_build"]

[tool.hatch.build.targets.sdist]
# vendor/ is included so `python -m build` (which builds the wheel from the sdist) and
# any downstream `pip install --no-binary` work without Node present.
include = ["aker_build", "hatch_build.py", "pyproject.toml", "README.md", "tests"]

[tool.hatch.build.targets.wheel.hooks.custom]
path = "hatch_build.py"

[tool.hatch.build.targets.sdist.hooks.custom]
path = "hatch_build.py"
```

- [ ] **Step 3: Write the PyPI long description**

Create `python/README.md`:

```markdown
# aker-build

Build SaaS with AI agents without losing architecture control.

Aker Build scans a repository, runs SaaS gates over what it finds, derives a queue, and
routes the one next-safest task along with the exact files that task may touch. It
reports; it never mutates your code, commits, merges, or executes an agent.

## Install

```bash
pip install aker-build
aker check .
```

**The package is `aker-build`; the command is `aker`.**

## Requirements

Node.js 22.13 or newer must be on your PATH. The engine is a single compiled
JavaScript bundle shipped inside this wheel — there is no separate download, but the
Node runtime itself is not bundled. Install it from [nodejs.org](https://nodejs.org).

## Scope your scan first

Detectors read code that *looks* like a vulnerability, and a security-adjacent test
suite is full of deliberately-unsafe examples. Create `aker-build.config.json` at your
repo root before the first real run:

```json
{
  "version": 1,
  "paths": {
    "exclude": ["**/tests/**", "**/*.test.ts", "fixtures/**", "examples/**"]
  }
}
```

## Links

- [Source and documentation](https://github.com/Kemetra/Aker-Build)
- [Issues](https://github.com/Kemetra/Aker-Build/issues)
```

- [ ] **Step 4: Ignore generated Python output**

Append to `.gitignore`:

```gitignore
# Python distribution. vendor/ is copied from the npm artifact at build time; dist/ is
# the built wheel and sdist. Neither is a source.
python/aker_build/vendor/
python/dist/
python/*.egg-info/
python/.pytest_cache/
```

- [ ] **Step 5: Build the wheel and sdist**

```bash
cd python && python -m build
```

Expected: `Successfully built aker_build-0.1.0.tar.gz and aker_build-0.1.0-py3-none-any.whl`.

If it reports the bundle missing, run `corepack pnpm build:cli-package` from the repo
root first — that is the hook failing closed by design.

- [ ] **Step 6: Commit**

```bash
git add python/pyproject.toml python/hatch_build.py python/README.md .gitignore
git -c commit.gpgsign=false commit -m "feat(python): package the wheel around the vendored bundle"
```

---

### Task 4: Packaging assertions and a clean-venv install

**Files:**
- Create: `python/tests/test_packaging.py`

**Interfaces:**
- Consumes: the built wheel from Task 3.
- Produces: assertions on wheel contents and version sync.

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_packaging.py`:

```python
"""Assertions about the built distribution rather than the source tree.

These require a prior `python -m build`, because two of the three inputs (the wheel and
the generated npm manifest) do not exist in a clean checkout.
"""

from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
PYTHON_DIR = HERE.parent
REPO = PYTHON_DIR.parent


def _wheel() -> Path:
    wheels = sorted((PYTHON_DIR / "dist").glob("aker_build-*-py3-none-any.whl"))
    if not wheels:
        pytest.skip("no wheel built; run `python -m build` in python/ first")
    return wheels[-1]


def test_exactly_one_universal_wheel_is_produced():
    # Pure JS means no per-platform matrix; more than one wheel would mean the build
    # started compiling something.
    wheels = sorted((PYTHON_DIR / "dist").glob("*.whl"))
    if not wheels:
        pytest.skip("no wheel built")
    assert len(wheels) == 1
    assert wheels[0].name.endswith("-py3-none-any.whl")


def test_wheel_contains_the_vendored_bundle_and_notices():
    names = zipfile.ZipFile(_wheel()).namelist()
    assert "aker_build/vendor/aker.js" in names
    assert "aker_build/vendor/THIRD_PARTY_NOTICES.txt" in names


def test_wheel_declares_exactly_one_console_script_named_aker():
    with zipfile.ZipFile(_wheel()) as archive:
        entry = next(n for n in archive.namelist() if n.endswith("entry_points.txt"))
        text = archive.read(entry).decode("utf8")
    scripts = re.findall(r"^(\S+)\s*=", text, flags=re.MULTILINE)
    assert scripts == ["aker"]


def test_wheel_version_matches_the_typescript_constant():
    source = (REPO / "packages" / "cli" / "src" / "version.ts").read_text(encoding="utf8")
    expected = re.search(r'CLI_VERSION\s*=\s*"([^"]+)"', source).group(1)
    assert f"aker_build-{expected}-" in _wheel().name


def test_wheel_version_matches_the_generated_npm_manifest():
    manifest = REPO / "packages" / "cli" / "dist" / "npm" / "package.json"
    if not manifest.is_file():
        pytest.skip("npm artifact not built; run `pnpm build:cli-package`")
    npm_version = json.loads(manifest.read_text(encoding="utf8"))["version"]
    # Skew between two registries publishing the same tool is the failure most likely
    # to go unnoticed, because each channel looks self-consistent on its own.
    assert f"aker_build-{npm_version}-" in _wheel().name


def test_sdist_is_self_sufficient():
    import tarfile

    sdists = sorted((PYTHON_DIR / "dist").glob("aker_build-*.tar.gz"))
    if not sdists:
        pytest.skip("no sdist built")
    names = tarfile.open(sdists[-1]).getnames()
    # `python -m build` builds the wheel FROM the sdist, so the sdist must carry the
    # bundle or that step would need Node.
    assert any(n.endswith("aker_build/vendor/aker.js") for n in names)
    assert any(n.endswith("pyproject.toml") for n in names)
```

- [ ] **Step 2: Run the test**

```bash
cd python && python -m pytest tests/test_packaging.py -q
```

Expected: PASS, 6 tests. If a test skips, the build has not been run — run
`python -m build` first, and treat a skip as a gap rather than a pass.

- [ ] **Step 3: Prove a clean-virtualenv install**

```bash
cd python && rm -rf .venv-check && python -m venv .venv-check
./.venv-check/Scripts/pip install --quiet dist/aker_build-0.1.0-py3-none-any.whl
./.venv-check/Scripts/aker --version
```

Expected: prints `0.1.0`. On Linux/macOS the paths are `.venv-check/bin/…`.

- [ ] **Step 4: Prove the exit code survives the console script**

```bash
cd python && ./.venv-check/Scripts/aker --nonsense > /dev/null 2>&1; echo "exit=$?"
./.venv-check/Scripts/aker --version > /dev/null 2>&1; echo "exit=$?"
```

Expected: `exit=1` then `exit=0`. This is the end-to-end proof that the console-script
wrapper does not swallow the child's status.

- [ ] **Step 5: Clean up the probe venv**

```bash
cd python && rm -rf .venv-check
```

- [ ] **Step 6: Commit**

```bash
git add python/tests/test_packaging.py
git -c commit.gpgsign=false commit -m "test(python): assert wheel contents, version sync, and one console script"
```

---

### Task 5: CI matrix job and the release workflow

**Files:**
- Create: `.github/workflows/pypi-release.yml`
- Modify: `.github/workflows/aker-build.yml`

**Interfaces:**
- Consumes: the tests and build from Tasks 1–4.
- Produces: CI enforcement; a manual, gated publish path.

- [ ] **Step 1: Add the Python test job**

In `.github/workflows/aker-build.yml`, append this job after `package-acceptance`,
matching its indentation exactly:

```yaml
  python-package:
    name: Python package (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v6

      - name: Set up Node
        uses: actions/setup-node@v6
        with:
          node-version: "22.14"

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.13"

      - run: corepack enable

      - name: Install workspace dependencies
        run: corepack pnpm install --frozen-lockfile

      - name: Build the CLI bundle the wheel vendors
        run: corepack pnpm build:cli-package

      - name: Install Python build tooling
        run: python -m pip install --upgrade build pytest

      - name: Build the wheel and sdist
        working-directory: python
        run: python -m build

      # Windows console scripts go through a generated .exe wrapper, which is exactly
      # where argument forwarding breaks — hence the matrix rather than Ubuntu alone.
      - name: Run the Python tests
        working-directory: python
        run: python -m pytest -q
```

- [ ] **Step 2: Write the release workflow**

Create `.github/workflows/pypi-release.yml`. The filename must stay exactly this —
PyPI's registered Trusted Publisher matches on it:

```yaml
# Manual, environment-protected PyPI publish via OIDC Trusted Publishing.
#
# Mirrors npm-release.yml: dispatch-only, a protected environment, no long-lived token.
# The filename is part of the registered publisher configuration on PyPI and must not
# change without updating it there.
name: PyPI Release

on:
  workflow_dispatch:
    inputs:
      version:
        description: Exact package version; dispatch this workflow from refs/tags/v<version>
        required: true

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    environment: pypi
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v6

      - name: Set up Node
        uses: actions/setup-node@v6
        with:
          node-version: "22.14"

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.13"

      - run: corepack enable

      - name: Install workspace dependencies
        run: corepack pnpm install --frozen-lockfile

      - name: Build the CLI bundle
        run: corepack pnpm build:cli-package

      - name: Install build tooling
        run: python -m pip install --upgrade build pytest

      - name: Build the distribution
        working-directory: python
        run: python -m build

      - name: Verify the distribution before publishing
        working-directory: python
        run: python -m pytest -q

      - name: Fail closed on a version mismatch
        working-directory: python
        run: |
          python - <<'PY'
          import glob, os, sys
          requested = os.environ["REQUESTED"]
          wheels = glob.glob("dist/aker_build-*-py3-none-any.whl")
          if len(wheels) != 1:
              sys.exit(f"expected exactly one wheel, found {wheels}")
          if f"aker_build-{requested}-" not in wheels[0]:
              sys.exit(f"requested {requested} but built {wheels[0]}")
          print(f"version check passed: {wheels[0]}")
          PY
        env:
          REQUESTED: ${{ inputs.version }}

      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: python/dist
```

- [ ] **Step 3: Validate the workflow YAML parses**

```bash
node --input-type=module -e "
import {readFileSync} from 'node:fs';
for (const f of ['.github/workflows/pypi-release.yml', '.github/workflows/aker-build.yml']) {
  const text = readFileSync(f, 'utf8');
  const jobs = [...text.matchAll(/^  ([a-z][a-z0-9-]*):$/gm)].map(m => m[1]);
  console.log(f, '->', jobs.join(', '));
}
"
```

Expected: `pypi-release.yml -> publish` and `aker-build.yml` listing its jobs
including `python-package`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/pypi-release.yml .github/workflows/aker-build.yml
git -c commit.gpgsign=false commit -m "ci(python): test the wheel on both platforms and gate the PyPI publish"
```

---

### Task 6: Document the second channel

**Files:**
- Modify: `README.md`
- Modify: `docs/release/npm.md` → add a sibling `docs/release/pypi.md`

**Interfaces:**
- Consumes: the shipped package.
- Produces: no code interfaces.

- [ ] **Step 1: Add the pip path to the root README**

In `README.md`, immediately after the `npx --package aker-build aker check .` block
and its package-vs-command note, add:

```markdown
Python-first toolchains can install the same CLI from PyPI:

```bash
pip install aker-build
aker check .
```

The wheel carries the compiled JavaScript engine and requires Node.js 22.13+ on your
PATH; it does not bundle a Node runtime. Both channels publish the same
`CLI_VERSION`, so `pip` and `npm` never diverge.
```

- [ ] **Step 2: Write the release runbook**

Create `docs/release/pypi.md`:

```markdown
# Publishing `aker-build` to PyPI

The PyPI channel wraps the same compiled bundle npm ships. There is no second engine
and no second version number: both read `CLI_VERSION` from
`packages/cli/src/version.ts`.

## One-time setup (operator)

1. Register a Trusted Publisher at <https://pypi.org/manage/account/publishing/>:
   - PyPI Project Name: `aker-build`
   - Owner: `Kemetra`
   - Repository name: `Aker-Build`
   - Workflow name: `pypi-release.yml` — must match the filename exactly
   - Environment name: `pypi`
2. Create the `pypi` environment under repository Settings → Environments, with the
   reviewers who may approve a publish.

No API token is stored anywhere; the workflow authenticates by OIDC.

## Publishing

1. Confirm `CLI_VERSION` is the version you intend to ship.
2. Tag the release commit `v<version>` and push the tag.
3. Dispatch **PyPI Release** from that tag, entering the same `<version>`.
4. Approve the `pypi` environment gate.

The workflow builds the bundle, builds the distribution, runs the Python tests, and
fails closed if the built wheel's version does not match the dispatched input — so a
tag/version mismatch cannot publish.

## Verifying afterwards

```bash
python -m venv /tmp/aker-check && /tmp/aker-check/bin/pip install aker-build
/tmp/aker-check/bin/aker --version
```

## Local dry run

Everything except the upload can be rehearsed locally:

```bash
corepack pnpm build:cli-package
cd python && python -m build && python -m pytest -q
```
```

- [ ] **Step 3: Run the full verification**

```bash
corepack pnpm test && corepack pnpm typecheck && corepack pnpm test:agent-bundle
cd python && python -m pytest -q
```

Expected: all exit 0. Revert `pnpm-lock.yaml` if it was dirtied:
`git checkout pnpm-lock.yaml`.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/release/pypi.md
git -c commit.gpgsign=false commit -m "docs(python): document the PyPI channel and its release runbook"
```

---

## Self-Review

**Spec coverage:** Stop-condition assessment → already recorded in the spec, nothing to
implement. Architecture (build-time copy) → Task 3's hook. Launcher's four
responsibilities → Task 2 (`find_node`, `_node_version`, argv forwarding, verbatim exit
code). Version floor from a single constant → Task 1 `NODE_FLOOR` plus a test pinning it
to `22.13`. Version synchronization via `version.ts` → Task 3 `[tool.hatch.version]`,
asserted in Task 4. Build sequencing (sdist self-sufficient) → Task 3 sdist `include`,
asserted in Task 4. All 8 Testing rows → Task 1 (version parsing), Task 2 (Node-missing,
argv, exit codes), Task 4 (wheel build, clean-venv install, version sync), Task 6 Step 3
(existing repo tests). CI on both platforms → Task 5 Step 1. Release workflow named
`pypi-release.yml` → Task 5 Step 2. All 5 Risks → hook fails closed (Task 3), version
sync test (Task 4), workflow filename (Task 5 + runbook), Windows matrix (Task 5), Node
prerequisite stated before the install command (Task 6 + `python/README.md`). No gaps.

**Placeholder scan:** No TBD/TODO. Every step carries literal content. The one
conditional instruction (Task 3 Step 5's "if it reports the bundle missing") names the
exact command to run.

**Type consistency:** `parse_node_version` returns `tuple[int, int] | None` and
`meets_floor` accepts that tuple in both definition and tests. `find_node` returns
`str | None`; Task 2 monkeypatches it with the same shape. `main(argv=None) -> int` is
used identically in tests, `__main__` guard, and the `[project.scripts]` entry point.
`bundle_path() -> Path` is patched in tests and called in `main`. An earlier draft
defined `NodeMissingError`/`NodeTooOldError`; they were removed because `main` returns
exit codes rather than raising, so nothing would ever have raised them — unused public
API is a maintenance cost with no caller.

**Note on counts:** test counts (6/7/6) and the 620 KB figure are the values measured at
plan time. Treat assertions as "all pass" rather than pinning a number.
