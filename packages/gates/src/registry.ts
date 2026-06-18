import type { Gate } from "./types.js";
import { g0SourceTruth } from "./gates/g0-source-truth.js";
import { g1Architecture } from "./gates/g1-architecture.js";
import { g2Contract } from "./gates/g2-contract.js";
import { g3Migration } from "./gates/g3-migration.js";
import { g4Security } from "./gates/g4-security.js";
import { g5Idempotency } from "./gates/g5-idempotency.js";
import { g6Billing } from "./gates/g6-billing.js";
import { g7Observability } from "./gates/g7-observability.js";
import { g8Dependency } from "./gates/g8-dependency.js";
import { g9Release } from "./gates/g9-release.js";

/** The v0 gate set, in canonical id order (TG-G0 … TG-G9). */
export const GATES: readonly Gate[] = [
  g0SourceTruth,
  g1Architecture,
  g2Contract,
  g3Migration,
  g4Security,
  g5Idempotency,
  g6Billing,
  g7Observability,
  g8Dependency,
  g9Release,
];

/** Raised when `--gates` names an id not in the registry. */
export class UnknownGateError extends Error {}

/**
 * Select gates to run. Empty/undefined → the full set. Otherwise filter by id, preserving
 * canonical order; an unknown id throws (CLI maps this to a clear non-zero exit, FR-006).
 */
export function selectGates(ids?: string[]): Gate[] {
  if (!ids || ids.length === 0) return [...GATES];
  const known = new Set(GATES.map((g) => g.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    const valid = GATES.map((g) => g.id).join(", ");
    throw new UnknownGateError(`Unknown gate id(s): ${unknown.join(", ")}. Valid ids: ${valid}`);
  }
  const want = new Set(ids);
  return GATES.filter((g) => want.has(g.id));
}
