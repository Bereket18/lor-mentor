/**
 * Anatomy Lab seed registry.
 *
 * Each entry describes one independently seeded system. The seed script reads
 * this registry instead of importing a single system directly, so adding a
 * system is a data change rather than a script change.
 *
 * `layerOrder` is the teaching order for that system's layer filters. The seed
 * uses it to assign each structure's sortOrder, and the viewer derives the
 * visible layer order from the sorted structures. Unknown layers fall after
 * the listed ones, preserving the old "never hide a structure" behaviour.
 */

import {
  HEART_LAYER_ORDER,
  HEART_STRUCTURES,
  HEART_SYSTEM,
  validateHeartSeed,
} from './anatomy-heart.data';
import {
  URINARY_LAYER_ORDER,
  URINARY_STRUCTURES,
  URINARY_SYSTEM,
  validateUrinarySeed,
} from './anatomy-urinary.data';

import type { AnatomyStructureSeed } from './anatomy-heart.data';

export interface AnatomySystemSeed {
  slug: string;
  name: string;
  latinName: string | null;
  description: string;
  modelUrl: string | null;
  isSample: boolean;
  isPublished: boolean;
  sortOrder: number;
}

export interface AnatomySeedEntry {
  system: AnatomySystemSeed;
  structures: AnatomyStructureSeed[];
  layerOrder: readonly string[];
  validate: () => void;
}

export const ANATOMY_SEED_REGISTRY: readonly AnatomySeedEntry[] = [
  {
    system: HEART_SYSTEM,
    structures: HEART_STRUCTURES,
    layerOrder: HEART_LAYER_ORDER,
    validate: validateHeartSeed,
  },
  {
    system: URINARY_SYSTEM,
    structures: URINARY_STRUCTURES,
    layerOrder: URINARY_LAYER_ORDER,
    validate: validateUrinarySeed,
  },
];

export const ANATOMY_SYSTEM_SLUGS = ANATOMY_SEED_REGISTRY.map(
  (entry) => entry.system.slug,
);

export function getAnatomySeedEntry(slug: string): AnatomySeedEntry {
  const entry = ANATOMY_SEED_REGISTRY.find(
    (candidate) => candidate.system.slug === slug,
  );
  if (!entry) {
    throw new Error(
      `Unknown anatomy system "${slug}". Available systems: ${ANATOMY_SYSTEM_SLUGS.join(
        ', ',
      )}.`,
    );
  }
  return entry;
}

/**
 * Structures in teaching order: layerOrder first, then the order they appear in
 * the seed file. The returned array is used only to assign sortOrder; it never
 * changes the structure content.
 */
export function orderStructuresForSeed(
  entry: AnatomySeedEntry,
): AnatomyStructureSeed[] {
  const rank = new Map(
    entry.layerOrder.map((layer, index) => [layer, index] as const),
  );
  const fallbackRank = entry.layerOrder.length;

  return entry.structures
    .map((structure, index) => ({ structure, index }))
    .sort((a, b) => {
      const aRank = rank.get(a.structure.layer) ?? fallbackRank;
      const bRank = rank.get(b.structure.layer) ?? fallbackRank;
      return aRank - bRank || a.index - b.index;
    })
    .map(({ structure }) => structure);
}
