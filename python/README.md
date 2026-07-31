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
