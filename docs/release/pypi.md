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
