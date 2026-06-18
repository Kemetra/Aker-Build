import { parse as parseYaml } from "yaml";

/**
 * Parse the canonical JSON form of a Project Map into a plain object (T014).
 * No network, no filesystem — caller provides the text (FR-010).
 */
export function loadJson(text: string): unknown {
  return JSON.parse(text);
}

/**
 * Parse the YAML convenience form into the SAME logical object as the JSON form (T020).
 * JSON is canonical; YAML must carry identical meaning (FR-009).
 */
export function loadYaml(text: string): unknown {
  return parseYaml(text);
}
