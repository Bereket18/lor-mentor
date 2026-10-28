import type { AnatomyStructure } from "@/types/anatomy";

/**
 * Turn a layer slug into a readable label. Labels come from the data (the
 * layer slug) rather than a heart-only table, so a new system needs no viewer
 * code change.
 */
export function layerLabel(layer: string | null): string {
  if (!layer) return "Other structures";
  return layer
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Order the layers present in a system by the first structure that uses each
 * one. The API returns structures in teaching order (sortOrder), so the layer
 * filters follow that order. Unknown layers are included and never hidden.
 */
export function orderedLayers(structures: AnatomyStructure[]): string[] {
  const firstOrder = new Map<string, number>();

  for (const structure of structures) {
    if (structure.layer === null) continue;
    const order = Number.isFinite(structure.sortOrder)
      ? structure.sortOrder
      : Number.MAX_SAFE_INTEGER;
    const current = firstOrder.get(structure.layer);
    if (current === undefined || order < current) {
      firstOrder.set(structure.layer, order);
    }
  }

  return [...firstOrder.entries()]
    .sort(
      ([aLayer, aOrder], [bLayer, bOrder]) =>
        aOrder - bOrder || aLayer.localeCompare(bLayer),
    )
    .map(([layer]) => layer);
}

export function matchesStructureQuery(
  structure: AnatomyStructure,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return [
    structure.name,
    structure.latinName ?? "",
    structure.summary,
    structure.layer ?? "",
    layerLabel(structure.layer),
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
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
