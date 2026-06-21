/**
 * The write-allowlist chokepoint (FR-007 / FR-014). The App's ONLY permitted GitHub write is
 * creating or updating a Checks run (which carries its annotations). Every other write — commit,
 * push, branch update, label, merge, close, review-request — is forbidden and MUST be unreachable.
 *
 * This is enforced as a single function all writes route through, so the safety boundary is one
 * auditable place rather than scattered call sites. A Checks status is not a repository mutation,
 * so this does not breach Principle VI (No Hidden Mutation).
 */

export class ForbiddenWriteError extends Error {
  constructor(operation: string) {
    super(
      `Forbidden GitHub write blocked: "${operation}". The report-only App may ONLY create/update a Checks run.`,
    );
    this.name = "ForbiddenWriteError";
  }
}

/** The only operations the App may perform against GitHub. */
export const ALLOWED_WRITES = ["checks.create", "checks.update"] as const;
export type AllowedWrite = (typeof ALLOWED_WRITES)[number];

/**
 * Assert an intended GitHub write is on the allowlist. Throws `ForbiddenWriteError` otherwise.
 * Call this immediately before any GitHub mutation; it is the single safety gate.
 */
export function assertAllowedWrite(operation: string): asserts operation is AllowedWrite {
  if (!(ALLOWED_WRITES as readonly string[]).includes(operation)) {
    throw new ForbiddenWriteError(operation);
  }
}
