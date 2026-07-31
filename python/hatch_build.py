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
