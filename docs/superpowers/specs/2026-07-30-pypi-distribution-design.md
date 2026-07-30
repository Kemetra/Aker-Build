# PyPI Distribution Design (Spec 020)

**Date:** 2026-07-30
**Status:** Approved (design); implementation pending plan + tasks review
**Scope:** A `pip install aker-build` path that reuses the existing npm bundle. No Python rewrite of the engine.

> Numbering note: 019 stays reserved for the governed loop, which nine committed
> references already name — including a comment inside
> `distribution/agent-command-surface.yaml`, a generated-bundle source whose edit would
> force a manifest-baseline recommit for a cosmetic reason. Renumbering this spec to 020
> costs one line; renumbering the loop would rewrite recorded records, which this project
> declines to do on principle.

> **Sequencing: Spec 021 lands first.** The wheel wraps whatever binary
> `pnpm build:cli-package` emits, and 021 renames that binary from `aker-build` to
> `aker`. Implementing 020 first would vendor a bundle under the old filename and
> declare a console script that 021 then has to change — so the Python work would be
> written twice. 021 is a small, self-contained rename; do it, then build on it.

## Problem

Aker Build ships as an npm package. Teams whose tooling is Python-first — data
platforms, ML repos, anything driven by `pipx`/`uv` — cannot install it through
their existing dependency path even though the CLI itself is language-agnostic.

The goal is a second distribution channel, not a second implementation:

```bash
pip install aker-build
aker check .
```

## Stop-condition assessment

The authorizing brief required stopping if bundling the JS inside a wheel created
licensing, size, or platform problems. All three were checked against the real
artifact (`pnpm build:cli-package`) before designing. **None blocks.**

| Concern | Finding | Verdict |
|---|---|---|
| Licensing | Bundle is MIT. Bundled deps (Commander, YAML, Zod) are MIT/ISC, full texts already aggregated into `THIRD_PARTY_NOTICES.txt` by the existing build. All permissive and redistributable. | Clear |
| Size | `aker-build.js` is 619 KB; the whole npm artifact is 5 files. PyPI's per-file default limit is 100 MB. | Clear |
| Platform | The bundle is **pure JavaScript — zero native code, zero `node_modules`**. | Clear, and decisive |

The platform finding shapes the whole design: because nothing is compiled, the
result is a single `py3-none-any` wheel. No per-platform matrix, no
`cibuildwheel`, no manylinux images. Node is a *runtime prerequisite*, not a build
dependency.

## Architecture

```text
packages/cli/src/version.ts    (CLI_VERSION — read directly for wheel metadata)
packages/cli/src/**            (TypeScript — the only source of truth)
        ↓  pnpm build:cli-package   (existing, unchanged)
packages/cli/dist/npm/
        dist/aker-build.js         619 KB, pure JS, zero deps, shebang intact
        THIRD_PARTY_NOTICES.txt
        ↓  hatch build hook (new)
python/aker_build/vendor/          (copied at build time, git-ignored)
        ↓  python -m build
aker_build-0.1.0-py3-none-any.whl  ONE universal wheel
aker_build-0.1.0.tar.gz            sdist, self-sufficient (carries vendor/)
```

The launcher's entire job: locate Node, verify `>= 22.13`, exec the bundled JS
with `argv` forwarded, propagate the exit code.

### Why build-time copy

Three options were considered.

**Build-time copy from the npm artifact (chosen).** The build hook runs the
existing `build:cli-package` and copies its output. One source of truth, and the
wheel cannot contain a stale engine because it is regenerated from TypeScript on
every build. Cost: building the sdist/wheel requires Node and pnpm present.

**Download from npm at install time.** Rejected. A tiny wheel, but it adds a
network dependency to first run, breaks air-gapped and offline installs, requires
npm to be published before PyPI can work at all, and turns an unpinned fetch into
a supply-chain surface.

**Commit the bundle into the Python tree.** Rejected. It removes the Node build
requirement, but commits a 619 KB generated artifact to git history, and it drifts
from the TypeScript silently. Spec 018's entire lesson was that a hand-maintained
copy of generated content disagrees with its source eventually — the same argument
applies here.

## The launcher

`python/aker_build/__main__.py`, plus one console-script entry point named `aker`.

The package is `aker-build`; the command is `aker`. Distribution and invocation are
separate concerns, and both registries model them as independent fields — see Spec
021, which renames the command across the existing surface. `aker-build` ships **no**
console script of its own: nothing is published yet, so there is no prior name to stay
compatible with, and a second entry point would be a permanent surface added for
nobody.

```toml
[project.scripts]
aker = "aker_build.__main__:main"
```

Responsibilities, in order:

1. **Locate Node.** `shutil.which("node")`. If absent, exit non-zero with an
   actionable message naming the required version and pointing at nodejs.org —
   never a traceback, because a missing prerequisite is a user-fixable condition,
   not a crash.
2. **Verify the version.** Run `node --version`, parse `vMAJOR.MINOR.PATCH`,
   compare against the floor as an integer tuple. String comparison would rank
   `v9` above `v22`.
3. **Exec the bundle.** Forward `sys.argv[1:]` unmodified. Do not re-quote or
   re-parse: the CLI owns its own argument grammar, and a launcher that
   interprets arguments becomes a second grammar to keep in sync.
4. **Propagate the exit code.** `aker-build` uses distinct non-zero codes, and each
   command maps them differently — `route` documents 1 missing queue / 2 not a Git
   repo / 3 internal, while `scan` maps its own conditions. Verified against the
   real bundle: `--version` exits 0, `route` with no queue exits 1. The launcher
   must therefore forward the child's code verbatim rather than normalize it, and
   must not encode any per-command knowledge — that mapping belongs to the CLI.

Stdout and stderr stay unbuffered and interleaved as the child writes them; the
launcher does not capture or reformat output.

### Version floor

`>= 22.13`, matching `engines.node` in the generated npm manifest. The floor is
read from a single generated constant rather than hard-coded in Python, so it
cannot drift from the npm package.

## Version synchronization

`CLI_VERSION` in `packages/cli/src/version.ts` is already the single source of
truth — the npm build reads it, and Spec 018's bundle generator reads it.

Hatchling reads it directly, with no generated Python module in between:

```toml
[tool.hatch.version]
path = "../packages/cli/src/version.ts"
pattern = 'CLI_VERSION\s*=\s*"(?P<version>[^"]+)"'
```

**Verified by a scratch build** — this produced `aker_build-0.1.0` from the
TypeScript constant. It matters that the version source is a *committed* file:
`packages/cli/dist/npm/package.json` and any generated `_version.py` do not exist
in a fresh clone, so a backend resolving metadata from either would fail before
the build hook could run. `version.ts` is committed, so the ordering hazard does
not arise.

A test asserts the npm manifest version matches the wheel metadata version once
both exist. This test can only run *after* a build, since the npm manifest is
generated. Version skew between two registries publishing the same tool is the
failure mode most likely to go unnoticed, because each channel looks
self-consistent.

## Build sequencing

`python -m build` builds the wheel *from the sdist* by default, so the sdist must
be self-sufficient. **Verified by a scratch build:** including the vendored bundle
in the sdist makes the sdist→wheel step need no Node at all, and the wheel
contained `aker_build/vendor/aker-build.js` without any `force-include` — a
subdirectory inside the package directory ships automatically.

The resulting chain:

| Step | Needs Node? |
|---|---|
| `pnpm build:cli-package` → the JS bundle | yes |
| build hook copies bundle into `python/aker_build/vendor/` | no |
| `python -m build` → sdist + wheel | no |
| downstream `pip install` (wheel or `--no-binary` sdist) | no (runtime only) |

Only the first step requires the JavaScript toolchain, and that step already
exists and is already verified by `pnpm test:cli-package`.

## Release

`.github/workflows/pypi-release.yml`, mirroring `npm-release.yml`:
`workflow_dispatch` only, a protected `pypi` environment, `id-token: write` for
Trusted Publishing, and no long-lived API token. The Trusted Publisher is
registered as `aker-build` / `Kemetra` / `Aker-Build` / `pypi-release.yml` /
environment `pypi` — **the workflow filename must match exactly** or PyPI rejects
the publish.

Publishing remains operator-owned, consistent with the npm boundary: everything
up to `twine upload` is automated and verified; the upload itself is a human
action.

## Testing

| Test | Proves |
|---|---|
| Node-missing path | Actionable message and non-zero exit, no traceback |
| Version parsing | `v22.13.0` passes, `v20.11.0` fails, `v9.0.0` fails (integer compare, not string) |
| Argument forwarding | `argv` reaches the child unmodified, including flags and paths with spaces |
| Exit-code propagation | Child codes surface unchanged, verbatim, with no per-command mapping in the launcher |
| Version sync | `CLI_VERSION` == npm manifest == wheel metadata |
| Wheel build | `python -m build` produces one `py3-none-any` wheel + sdist |
| Clean-venv install | Fresh venv, `pip install <wheel>`, then `aker --version` succeeds and `aker-build` is absent |
| Existing repo tests | `pnpm test`, `pnpm typecheck`, `pnpm test:agent-bundle` still pass |

The forwarding and exit-code tests use a stub Node script rather than the real
619 KB bundle, so they stay fast and do not depend on a prior JS build.

### CI

A new job runs the Python tests on **Ubuntu and Windows**, mirroring the existing
cross-OS package-acceptance matrix. This is not optional coverage: Windows console
scripts go through a generated `.exe` wrapper, which is precisely where argument
forwarding breaks — a quoted path with spaces that survives on Linux can arrive
re-split on Windows. A risk the design names must have a job that exercises it,
not just a test file that could run anywhere.

## Out of scope

- Publishing to PyPI. Operator action.
- A Python API. This ships a CLI launcher, not an importable library; exposing
  Python functions would create a second public surface to support.
- Rewriting any engine logic in Python.
- Vendoring Node itself. Users install Node; the wheel does not carry a runtime.
- Conda packaging.

## Risks

| Risk | Mitigation |
|---|---|
| npm and PyPI versions drift | Both read `CLI_VERSION` from the committed `version.ts`; a post-build test asserts the npm manifest and wheel metadata agree |
| Trusted Publisher filename mismatch rejects the publish | Workflow named `pypi-release.yml` to match the registered publisher exactly |
| Windows console-script wrapper mangles arguments | A dedicated CI job runs the Python tests on the Ubuntu + Windows matrix (see Testing → CI) |
| sdist built from a clean checkout has no bundle to vendor | The build hook fails closed with a message naming `pnpm build:cli-package`; a test asserts the vendored file is present in the built wheel |
| Users read `pip install` as "no Node needed" | README states the Node prerequisite before the install command, and the launcher's error message says it again at the point of failure |
