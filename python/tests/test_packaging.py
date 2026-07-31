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

import aker_build

HERE = Path(__file__).resolve().parent
PYTHON_DIR = HERE.parent
REPO = PYTHON_DIR.parent


def _cli_version() -> str:
    source = (REPO / "packages" / "cli" / "src" / "version.ts").read_text(encoding="utf8")
    return re.search(r'CLI_VERSION\s*=\s*"([^"]+)"', source).group(1)


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


def test_wheel_declares_the_vendored_bundle_as_an_es_module():
    # Without this manifest Node cannot tell the bundle's module type and emits
    # MODULE_TYPELESS_PACKAGE_JSON on every run, then reparses. npm's channel states the
    # type in its own package.json; the wheel has to state it too or the two channels
    # behave differently at runtime.
    with zipfile.ZipFile(_wheel()) as archive:
        assert "aker_build/vendor/package.json" in archive.namelist()
        manifest = json.loads(archive.read("aker_build/vendor/package.json"))
    assert manifest["type"] == "module"


def test_wheel_declares_exactly_one_console_script_named_aker():
    with zipfile.ZipFile(_wheel()) as archive:
        entry = next(n for n in archive.namelist() if n.endswith("entry_points.txt"))
        text = archive.read(entry).decode("utf8")
    scripts = re.findall(r"^(\S+)\s*=", text, flags=re.MULTILINE)
    assert scripts == ["aker"]


def test_wheel_version_matches_the_typescript_constant():
    assert f"aker_build-{_cli_version()}-" in _wheel().name


def test_package_dunder_version_matches_the_typescript_constant():
    # The wheel's *metadata* version is derived from version.ts by the build backend, but
    # `aker_build.__version__` is a literal. Without this assertion a CLI_VERSION bump
    # would ship a wheel whose metadata is correct and whose attribute is stale — the
    # kind of skew that stays invisible because each half looks right on its own.
    assert aker_build.__version__ == _cli_version()


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
