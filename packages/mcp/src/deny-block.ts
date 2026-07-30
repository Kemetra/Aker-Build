/** A Claude Code `settings.json` fragment carrying deny rules. */
export interface DenyBlock {
  permissions: { deny: string[] };
}

/**
 * Render a forbidden-file set as a Claude Code `settings.json` deny-block.
 *
 * Why this exists: putting "do not touch these files" in a compiled prompt is advisory text a
 * model may ignore. A deny rule is mechanical — Claude Code evaluates permissions deny-first, so a
 * denial wins regardless of ordering. Aker Build computes the boundary from a scan; the platform
 * enforces it. That handoff is what makes derived scope stronger than declared scope.
 *
 * **Caveat that must ship wherever this is documented:** deny rules govern the agent's own file
 * tools. They do not constrain arbitrary subprocesses the agent may spawn. This is "stronger than
 * a prompt", not "airtight" — claiming otherwise would be exactly the kind of overclaim this
 * project spent a design cycle retiring.
 *
 * Fails open on empty input, deliberately: an empty forbidden set yields an empty deny list, never
 * a wildcard. A wildcard would deny the entire tree — failing closed in the harmful direction.
 */
export function denyBlock(forbidden: string[]): DenyBlock {
  const deny: string[] = [];
  const seen = new Set<string>();
  for (const raw of forbidden) {
    const trimmed = raw.trim();
    if (trimmed === "") continue; // `Read(./)` would match the repo root
    const path = trimmed.startsWith("./") ? trimmed : `./${trimmed}`;
    if (seen.has(path)) continue;
    seen.add(path);
    deny.push(`Read(${path})`, `Edit(${path})`);
  }
  return { permissions: { deny } };
}
