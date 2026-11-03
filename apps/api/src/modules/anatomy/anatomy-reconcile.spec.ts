import {
  reconcilableStructureFields,
  reconcilableSystemFields,
} from '../../../prisma/anatomy-reconcile';
import type { AnatomyStructureSeed } from '../../../prisma/anatomy-heart.data';
import type { AnatomySystemSeed } from '../../../prisma/anatomy-registry';

/**
 * `--reconcile` is a structural refresh only. These tests merge the write
 * payloads onto rows that already carry live publication/review state, exactly
 * as a Prisma `update` would, and assert that state survives.
 */

describe('anatomy reconcile write payloads', () => {
  it('leaves a published system published', () => {
    const approvedAt = new Date('2026-01-02T03:04:05.000Z');
    const existingSystem = {
      id: 'system_heart',
      slug: 'heart',
      name: 'Heart and circulation',
      latinName: 'Systema cardiovasculare',
      description: 'Previously reviewed description.',
      modelUrl: '/models/anatomy/heart.v1.glb',
      isSample: false,
      isPublished: true,
      sortOrder: 1,
      contentRevision: 7,
      publicationApprovedAt: approvedAt,
      publicationApprovedById: 'user_admin',
      publicationApprovedRevision: 7,
    };

    // The seed says "not published, not a sample". Reconcile must not apply
    // either flag to the live row; it may only refresh structural metadata.
    const seedSystem: AnatomySystemSeed = {
      slug: 'heart',
      name: 'Heart and circulation',
      latinName: 'Systema cardiovasculare',
      description: 'Reconciled description.',
      modelUrl: '/models/anatomy/heart.v2.glb',
      isSample: false,
      isPublished: false,
      sortOrder: 1,
    };

    const data = reconcilableSystemFields(seedSystem);
    const after = { ...existingSystem, ...data };

    // Publication state survives.
    expect(after.isPublished).toBe(true);
    expect(after.isSample).toBe(false);
    expect(after.contentRevision).toBe(7);
    expect(after.publicationApprovedAt).toBe(approvedAt);
    expect(after.publicationApprovedById).toBe('user_admin');
    expect(after.publicationApprovedRevision).toBe(7);

    // Structural metadata is still refreshed.
    expect(after.modelUrl).toBe('/models/anatomy/heart.v2.glb');
    expect(after.description).toBe('Reconciled description.');

    // The payload is an allowlist: no publication/review field can leak in.
    expect(Object.keys(data).sort()).toEqual([
      'description',
      'latinName',
      'modelUrl',
      'name',
      'sortOrder',
    ]);
    for (const forbidden of [
      'isPublished',
      'isSample',
      'contentRevision',
      'publicationApprovedAt',
      'publicationApprovedById',
      'publicationApprovedRevision',
    ]) {
      expect(data).not.toHaveProperty(forbidden);
    }
  });

  it('leaves a reviewed structure review state untouched', () => {
    const reviewedAt = new Date('2026-02-03T04:05:06.000Z');
    const existingStructure = {
      id: 'structure_right_atrium',
      systemId: 'system_heart',
      slug: 'right-atrium',
      name: 'Right atrium',
      latinName: 'Atrium dextrum',
      summary: 'Reviewed summary.',
      location: 'Reviewed location.',
      function: 'Reviewed function.',
      bloodSupply: 'Reviewed blood supply.',
      clinicalNotes: 'Reviewed clinical notes.',
      meshName: 'right_atrium',
      layer: 'chambers',
      relatedSlugs: ['right-ventricle'],
      references: ['FMA:7096'],
      sortOrder: 1,
      isReviewed: true,
      reviewedAt,
      reviewedById: 'user_reviewer',
      reviewedRevisionId: 'revision_approved',
    };

    // The seed carries different derived fields. Reconcile may refresh those,
    // but it must not touch the approved teaching text or the sign-off.
    const seedStructure: AnatomyStructureSeed = {
      slug: 'right-atrium',
      name: 'Right atrium',
      latinName: 'Atrium dextrum',
      summary: 'Seed summary that must not be written.',
      location: 'Seed location.',
      function: 'Seed function.',
      bloodSupply: 'Seed blood supply.',
      clinicalNotes: 'Seed clinical notes.',
      meshName: 'right_atrium',
      layer: 'chambers',
      relatedSlugs: ['left-atrium'],
      references: ['FMA:99999'],
    };

    const data = reconcilableStructureFields(seedStructure, 2);
    const after = { ...existingStructure, ...data };

    // Review state survives.
    expect(after.isReviewed).toBe(true);
    expect(after.reviewedAt).toBe(reviewedAt);
    expect(after.reviewedById).toBe('user_reviewer');
    expect(after.reviewedRevisionId).toBe('revision_approved');

    // Teaching text and curated identity fields are untouched.
    expect(after.summary).toBe('Reviewed summary.');
    expect(after.location).toBe('Reviewed location.');
    expect(after.function).toBe('Reviewed function.');
    expect(after.bloodSupply).toBe('Reviewed blood supply.');
    expect(after.clinicalNotes).toBe('Reviewed clinical notes.');
    expect(after.name).toBe('Right atrium');
    expect(after.latinName).toBe('Atrium dextrum');
    expect(after.meshName).toBe('right_atrium');
    expect(after.layer).toBe('chambers');

    // Only structural fields change.
    expect(Object.keys(data).sort()).toEqual([
      'references',
      'relatedSlugs',
      'sortOrder',
    ]);
    expect(after.references).toEqual(['FMA:99999']);
    expect(after.relatedSlugs).toEqual(['left-atrium']);
    expect(after.sortOrder).toBe(2);

    for (const forbidden of [
      'isReviewed',
      'reviewedAt',
      'reviewedById',
      'reviewedRevisionId',
      'summary',
      'location',
      'function',
      'bloodSupply',
      'clinicalNotes',
      'name',
      'latinName',
      'meshName',
      'layer',
    ]) {
      expect(data).not.toHaveProperty(forbidden);
    }
  });
});
