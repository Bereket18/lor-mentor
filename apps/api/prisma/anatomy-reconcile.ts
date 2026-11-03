/**
 * Reconcile safety for the anatomy seed (`seed-anatomy.ts --reconcile`).
 *
 * Reconcile is a structural refresh, not an editorial or publication action.
 * It may refresh the fields the seed owns on rows that already exist, but it
 * must never change publication or review state:
 *
 *   - system: `isPublished`, `isSample`, `contentRevision`, and the
 *     `publicationApproved*` trio are never written.
 *   - structure: `isReviewed`, `reviewedAt`, `reviewedById`, and
 *     `reviewedRevisionId` are never written.
 *
 * It also never overwrites teaching text (`summary`, `location`, `function`,
 * `bloodSupply`, `clinicalNotes`), a curated Latin name, `name`, `meshName`, or
 * `layer` on an existing row.
 *
 * The functions below return the exact write payloads. They are allowlists, so
 * a field added to the seed types later cannot leak into a reconcile write
 * unless it is deliberately added here. They are pure so the tests can merge a
 * payload onto a published/reviewed row and assert that state survives.
 */

import type { AnatomyStructureSeed } from './anatomy-heart.data';
import type { AnatomySystemSeed } from './anatomy-registry';

export interface AnatomySystemStructuralFields {
  name: string;
  latinName: string | null;
  description: string;
  modelUrl: string | null;
  sortOrder: number;
}

export interface AnatomyStructureStructuralFields {
  references: string[];
  sortOrder: number;
  relatedSlugs: string[];
}

/**
 * Structural system fields reconcile may write.
 *
 * `slug` is omitted because it is the lookup key: a renamed slug is treated as
 * a new system rather than as a reconcile of the old one. Publication and
 * review fields are deliberately absent.
 */
export function reconcilableSystemFields(
  system: AnatomySystemSeed,
): AnatomySystemStructuralFields {
  return {
    name: system.name,
    latinName: system.latinName,
    description: system.description,
    modelUrl: system.modelUrl,
    sortOrder: system.sortOrder,
  };
}

/**
 * Structural structure fields reconcile may write.
 *
 * These are derived from the model and navigation graph, not faculty writing:
 * citations, teaching order, and related-structure slugs. Teaching text, the
 * curated identity fields, and every review field are deliberately absent.
 */
export function reconcilableStructureFields(
  structure: AnatomyStructureSeed,
  sortOrder: number,
): AnatomyStructureStructuralFields {
  return {
    references: structure.references,
    sortOrder,
    relatedSlugs: structure.relatedSlugs,
  };
}
