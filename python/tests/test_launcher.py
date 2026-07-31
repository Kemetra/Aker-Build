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
