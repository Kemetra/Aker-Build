// Standing guard for the shape of `npm publish` arguments in release workflows.
//
// `npm publish release/pkg-1.0.0.tgz` does not publish that file. npm parses a bare
// `a/b` argument as a GitHub shorthand and tries to clone it:
//
//   git ls-remote ssh://git@github.com/release/pkg-1.0.0.tgz.git
//   git@github.com: Permission denied (publickey)
//
// The failure is a git authentication error, which points nowhere near the real cause,
// and it only appears at the final step of a release — after every build and test has
// passed. An explicit `./` anchor removes the ambiguity.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const WORKFLOWS = join(".github", "workflows");
const YAML_EXTENSIONS = [".yml", ".yaml"];

// `npm publish <arg>`, with or without surrounding quotes.
const PUBLISH_ARG = /npm\s+publish\s+["']?([^"'\s]+)["']?/;

/** True when npm can only read the argument as a filesystem path. */
export function isExplicitLocalPath(argument) {
  // Anchored relative (./ ../ .\ ..\) or absolute (/… or C:\…). Anything else containing
  // a slash is indistinguishable from `owner/repo`.
  return /^(\.{1,2}[/\\]|[/\\]|[A-Za-z]:[/\\])/.test(argument);
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function workflowFiles(root) {
  const dir = join(root, WORKFLOWS);
  try {
    if (!statSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => YAML_EXTENSIONS.some((ext) => entry.endsWith(ext)))
    .map((entry) => join(dir, entry));
}

/** Every `npm publish` argument in a workflow that npm would not read as a file. */
export function findAmbiguousPublishArgs(root) {
  const found = [];
  for (const full of workflowFiles(root)) {
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((line, index) => {
      const match = PUBLISH_ARG.exec(line);
      if (match === null) return;
      const argument = match[1];
      // A flag is not a path, and a lone `.` is the current directory, which npm reads
      // as a directory rather than a repository.
      if (argument.startsWith("-") || argument === ".") return;
      if (isExplicitLocalPath(argument)) return;
      found.push({ file: toPosix(relative(root, full)), line: index + 1, argument });
    });
  }
  return found;
}
