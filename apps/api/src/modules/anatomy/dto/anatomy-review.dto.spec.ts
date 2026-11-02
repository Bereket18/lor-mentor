import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { ValidationError } from 'class-validator';
import {
  ReviewStructureParamsDto,
  ReviewSystemParamsDto,
  UpdateAnatomyStructureDto,
} from './anatomy-review.dto';

const VALID_PATCH = {
  updatedAt: '2026-10-31T10:00:00.000Z',
  summary: 'Main artery of the body.',
  location: 'Thorax and abdomen',
  function: 'Distributes oxygenated blood',
  bloodSupply: 'Vasa vasorum',
  clinicalNotes: 'Aortic dissection is a surgical emergency.',
  references: ['FMA:3734', 'Gray’s Anatomy, 42nd edition'],
  relatedSlugs: ['aortic-valve'],
  note: 'Tightened wording',
};

async function errorsFor(
  cls: new () => object,
  payload: Record<string, unknown>,
): Promise<ValidationError[]> {
  const instance = plainToInstance(cls, payload);
  return validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

function propertyNames(errors: ValidationError[]): string[] {
  return errors.map((error) => error.property);
}

describe('anatomy review DTO validation', () => {
  it('accepts a valid PATCH payload', async () => {
    expect(await errorsFor(UpdateAnatomyStructureDto, VALID_PATCH)).toEqual([]);
  });

  it('trims whitespace before validation', () => {
    const instance = plainToInstance(UpdateAnatomyStructureDto, {
      ...VALID_PATCH,
      summary: '  Trimmed summary  ',
      references: ['  FMA:3734  '],
    });
    expect(instance.summary).toBe('Trimmed summary');
    expect(instance.references).toEqual(['FMA:3734']);
  });

  it('rejects HTML tags in teaching text and references', async () => {
    expect(
      propertyNames(
        await errorsFor(UpdateAnatomyStructureDto, {
          ...VALID_PATCH,
          summary: 'A <strong>bold</strong> claim',
        }),
      ),
    ).toContain('summary');

    expect(
      propertyNames(
        await errorsFor(UpdateAnatomyStructureDto, {
          ...VALID_PATCH,
          references: ['<script>alert(1)</script>'],
        }),
      ),
    ).toContain('references');
  });

  it('enforces per-field maximum lengths', async () => {
    const cases: Array<[string, string, number]> = [
      ['summary', 's', 600],
      ['location', 'l', 800],
      ['function', 'f', 800],
      ['bloodSupply', 'b', 600],
      ['clinicalNotes', 'c', 800],
    ];

    for (const [field, character, max] of cases) {
      expect(
        propertyNames(
          await errorsFor(UpdateAnatomyStructureDto, {
            ...VALID_PATCH,
            [field]: character.repeat(max + 1),
          }),
        ),
      ).toContain(field);

      expect(
        await errorsFor(UpdateAnatomyStructureDto, {
          ...VALID_PATCH,
          [field]: character.repeat(max),
        }),
      ).toEqual([]);
    }
  });

  it('allows at most six references of 300 characters', async () => {
    expect(
      propertyNames(
        await errorsFor(UpdateAnatomyStructureDto, {
          ...VALID_PATCH,
          references: Array.from({ length: 7 }, () => 'FMA:1'),
        }),
      ),
    ).toContain('references');

    expect(
      propertyNames(
        await errorsFor(UpdateAnatomyStructureDto, {
          ...VALID_PATCH,
          references: ['r'.repeat(301)],
        }),
      ),
    ).toContain('references');

    expect(
      await errorsFor(UpdateAnatomyStructureDto, {
        ...VALID_PATCH,
        references: Array.from({ length: 6 }, () => 'r'.repeat(300)),
      }),
    ).toEqual([]);
  });

  it('rejects malformed related structure slugs', async () => {
    expect(
      propertyNames(
        await errorsFor(UpdateAnatomyStructureDto, {
          ...VALID_PATCH,
          relatedSlugs: ['Not A Slug'],
        }),
      ),
    ).toContain('relatedSlugs');
  });

  it('rejects unknown fields instead of silently accepting them', async () => {
    expect(
      propertyNames(
        await errorsFor(UpdateAnatomyStructureDto, {
          ...VALID_PATCH,
          isReviewed: true,
          isPublished: true,
        }),
      ),
    ).toEqual(expect.arrayContaining(['isReviewed', 'isPublished']));
  });

  it('requires an ISO updatedAt token', async () => {
    expect(
      propertyNames(
        await errorsFor(UpdateAnatomyStructureDto, {
          ...VALID_PATCH,
          updatedAt: 'not-a-date',
        }),
      ),
    ).toContain('updatedAt');
  });

  it('validates route parameters before the service runs', async () => {
    expect(
      await errorsFor(ReviewStructureParamsDto, { id: 'cm3abc123def456' }),
    ).toEqual([]);
    expect(
      propertyNames(await errorsFor(ReviewStructureParamsDto, { id: 'ABC-1' })),
    ).toContain('id');

    expect(await errorsFor(ReviewSystemParamsDto, { slug: 'heart' })).toEqual(
      [],
    );
    expect(
      propertyNames(await errorsFor(ReviewSystemParamsDto, { slug: 'Heart!' })),
    ).toContain('slug');
  });
});
