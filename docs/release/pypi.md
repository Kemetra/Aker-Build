# Publishing `aker-build` to PyPI

The PyPI channel wraps the same compiled bundle npm ships. There is no second engine
and no second version number: both read `CLI_VERSION` from
`packages/cli/src/version.ts`.

## Current state

`aker-build 0.1.2` is published and is the latest release:
<https://pypi.org/project/aker-build/> (wheel + sdist). Released from tag `v0.1.2` through
`pypi-release.yml`, which uploads a publish attestation alongside each artifact.

0.1.0 remains available as the bootstrap release. 0.1.1 was tagged but never published to
either registry — see `docs/release/npm.md`.

Note that `pip index versions aker-build` served a stale `0.1.0` for some minutes after the
upload succeeded. The authoritative check is the JSON API
(<https://pypi.org/pypi/aker-build/json>), not the index.

The setup below is **done** for this project; it is recorded because it must be repeated
for any new project, and because getting it wrong is the failure mode below.

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

**A Trusted Publisher is per-project, not per-account.** Holding one for another project
grants nothing here: PyPI looks for a publisher filed under *this* project name matching
the token's claims, and returns `invalid-publisher` ("valid token, but no corresponding
publisher") when there is none. Because a project that has never been published has no
settings page, the first registration must go in the **pending publishers** section at the
bottom of the account publishing page — a different form from the per-project one. Once the
first upload succeeds, PyPI converts the pending entry into a normal project publisher.

Unlike npm, this means PyPI's *first* release needs no manual token: pending publishers
exist precisely to break that chicken-and-egg.

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
