"""Python launcher for the Aker Build CLI.

The engine is TypeScript, compiled to a single JavaScript bundle and vendored into
this wheel at build time. Nothing here reimplements it; this package exists only so
Python-first toolchains can install the CLI through the dependency path they already
use.
"""

__all__ = ["__version__"]

# Kept in sync with packages/cli/src/version.ts by the build; see pyproject.toml.
__version__ = "0.1.0"
