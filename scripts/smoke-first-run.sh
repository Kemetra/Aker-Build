#!/usr/bin/env bash
# Aker Build first-run smoke (POSIX twin of smoke-first-run.ps1).
#
# Copies the example fixture into a temporary git repo, runs the full read-only
# advisory chain, introduces a controlled diff, and asserts the expected outputs.
# Assertions are kept identical to the PowerShell script on purpose: a smoke test
# that only checks exit codes would pass even if every detector went silent.
#
# Usage: scripts/smoke-first-run.sh [--remove-temp]

set -euo pipefail

REMOVE_TEMP=0
for arg in "$@"; do
  case "$arg" in
    --remove-temp) REMOVE_TEMP=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE="$ROOT/examples/multi-tenant-saas-basic"
CLI="$ROOT/packages/cli/src/bin.ts"

if [ ! -d "$EXAMPLE" ]; then
  echo "Example fixture not found: $EXAMPLE" >&2
  exit 1
fi

WORK_BASE="$(mktemp -d "${TMPDIR:-/tmp}/aker-build-first-run-XXXXXXXX")"
REPO="$WORK_BASE/repo"
OUT="$WORK_BASE/out"
mkdir -p "$REPO" "$OUT"

run_step() {
  local name="$1"; shift
  echo "== $name"
  "$@"
}

aker() {
  run_step "aker-build $*" pnpm dlx tsx "$CLI" "$@"
}

cp -R "$EXAMPLE/." "$REPO/"

run_step "git init" git -C "$REPO" init --quiet
git -C "$REPO" config user.email "demo@example.test"
git -C "$REPO" config user.name "Aker Build Demo"
git -C "$REPO" config core.autocrlf false
git -C "$REPO" config commit.gpgsign false
run_step "git add fixture files" git -C "$REPO" add README.md package.json apps migrations
run_step "git commit baseline" git -C "$REPO" -c commit.gpgsign=false commit --quiet -m "baseline example"

aker scan "$REPO" --out "$OUT"
aker gates "$REPO" --out "$OUT"
aker queue "$REPO" --out "$OUT"
aker route "$REPO" --out "$OUT"
aker prompt Q-001 --agent claude --out "$OUT"

# Controlled diff: an unguarded admin route the reviewer must not call ready.
mkdir -p "$REPO/apps/api/src/routes"
cat > "$REPO/apps/api/src/routes/admin-preview.ts" <<'TS'
type Handler = (_req: unknown, res: { json: (value: unknown) => void }) => void;

export const router: { get: (path: string, handler: Handler) => void } = {
  get: () => undefined,
};

router.get("/admin/preview", (_req, res) => {
  res.json({ status: "preview" });
});
TS

aker review-pr "$REPO" --local-diff --item Q-001 --out "$OUT"
aker report "$REPO" --out "$OUT"

for file in \
  project-map.json risks.json queue.json route.json prompt-Q-001.md \
  review.json review.md aker-build-report.json aker-build-report.md; do
  if [ ! -f "$OUT/$file" ]; then
    echo "Missing expected output: $OUT/$file" >&2
    exit 1
  fi
done

# Content assertions — these are what make this a smoke test rather than a
# "did it exit 0" check. node is already required to run the CLI.
node - "$OUT" <<'NODE'
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const out = process.argv[2];
const read = (f) => JSON.parse(readFileSync(join(out, f), "utf8"));
const fail = (m) => { console.error(m); process.exit(1); };

const queue = read("queue.json");
if (!Array.isArray(queue.items) || queue.items.length < 1) {
  fail("queue.json did not contain at least one queue item");
}

const review = read("review.json");
if (review.verdict === "ready") {
  fail("review.json was expected to be not_ready or needs_verification for the controlled diff");
}
if (!(review.changed_files ?? []).includes("apps/api/src/routes/admin-preview.ts")) {
  fail("review.json did not include the controlled changed file");
}

const report = read("aker-build-report.json");
if (!report.summary?.project_name?.trim()) {
  fail("aker-build-report.json did not include a project name");
}
if ((report.summary?.findings?.total ?? 0) < 1) {
  fail("aker-build-report.json did not summarize findings");
}
if ((report.summary?.review?.changed_files ?? 0) < 1) {
  fail("aker-build-report.json did not summarize review changed files");
}
NODE

echo
echo "Aker Build first-run smoke passed."
echo "Temp repo: $REPO"
echo "Outputs:   $OUT"

if [ "$REMOVE_TEMP" -eq 1 ]; then
  case "$WORK_BASE" in
    "${TMPDIR:-/tmp}"/aker-build-first-run-*) rm -rf "$WORK_BASE"; echo "Removed temp directory: $WORK_BASE" ;;
    *) echo "Refusing to remove a path outside the temp directory: $WORK_BASE" >&2; exit 1 ;;
  esac
fi
