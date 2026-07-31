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

# The bundle is ESM, and npm says so with `"type": "module"` in its package manifest.
# A wheel has no such manifest, so Node walks up from aker.js, finds nothing, tries
# CommonJS, fails, and reparses as ESM — printing MODULE_TYPELESS_PACKAGE_JSON and
# paying a reparse cost on *every* invocation. Stating the type removes the guess and
# keeps the two channels' runtime behaviour identical.
MANIFEST = VENDOR / "package.json"
MANIFEST_TEXT = '{\n  "type": "module"\n}\n'


class VendorBundleHook(BuildHookInterface):
    PLUGIN_NAME = "vendor-bundle"

    def initialize(self, version: str, build_data: dict) -> None:
        # An sdist built from a clean checkout already carries vendor/, so a missing
        # artifact is only an error when there is nothing vendored to fall back on.
        if self._already_vendored():
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
        MANIFEST.write_text(MANIFEST_TEXT, encoding="utf8")

    @staticmethod
    def _already_vendored() -> bool:
        # The manifest counts as vendored content: a vendor/ carrying the bundle but no
        # manifest is incomplete, and treating it as complete would let the ESM guess
        # back in through the sdist path.
        return all(destination.is_file() for _, destination in COPIES) and MANIFEST.is_file()
