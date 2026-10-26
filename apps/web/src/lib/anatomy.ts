import type { AnatomyStructure } from "@/types/anatomy";

/**
 * Display order for the heart model layers. New layers fall back to the end of
 * the list so adding one never hides a structure from the UI.
 */
export const LAYER_ORDER = [
  "chambers",
  "valves",
  "great-vessels",
  "coronary-circulation",
] as const;

export const LAYER_LABELS: Record<string, string> = {
  chambers: "Chambers",
  valves: "Valves",
  "great-vessels": "Great vessels",
  "coronary-circulation": "Coronary circulation",
};

export function layerLabel(layer: string | null): string {
  if (!layer) return "Other structures";
  return (
    LAYER_LABELS[layer] ??
    layer
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function orderedLayers(structures: AnatomyStructure[]): string[] {
  const present = new Set(
    structures
      .map((structure) => structure.layer)
      .filter((layer): layer is string => layer !== null),
  );
  const ordered = LAYER_ORDER.filter((layer) => present.has(layer));
  const extra = Array.from(present)
    .filter((layer) => !(LAYER_ORDER as readonly string[]).includes(layer))
    .sort();
  return [...ordered, ...extra];
}

export function matchesStructureQuery(
  structure: AnatomyStructure,
  query: string,
): boolean {
  const value = query.trim().toLowerCase();
  if (!value) return true;

  return [
    structure.name,
    structure.latinName,
    structure.summary,
    structure.layer,
    layerLabel(structure.layer),
  ].some((field) => field?.toLowerCase().includes(value));
}

/**
 * Only root-relative anatomy GLB paths may reach the loader. Reject absolute
 * URLs, protocol-relative URLs, path traversal, encoded segments, and other
 * file types so a bad API response cannot make the browser fetch an arbitrary
 * resource. The optional retry query is the one the viewer adds to bypass the
 * GLTF cache after a failed load.
 */
const ANATOMY_MODEL_URL =
  /^\/models\/anatomy\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.glb(?:\?retry=\d+)?$/;

export function isAllowedAnatomyModelUrl(value: string): boolean {
  return ANATOMY_MODEL_URL.test(value);
}
