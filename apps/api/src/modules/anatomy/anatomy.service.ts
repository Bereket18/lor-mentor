import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

import type { RequestUser } from '../../common/types/request-user';

@Injectable()
export class AnatomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  // The picker only needs metadata, never the protected structure text.
  async listSystems() {
    const systems = await this.prisma.anatomySystem.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        latinName: true,
        description: true,
        modelUrl: true,
        isSample: true,
        sortOrder: true,
        _count: { select: { structures: true } },
      },
    });

    return systems.map(({ _count, ...system }) => ({
      ...system,
      structureCount: _count.structures,
    }));
  }

  // The subscription check belongs here, not only in a controller guard: a
  // sample system must remain accessible to unsubscribed students, while a
  // normal system must not leak its structure text.
  async getSystem(user: RequestUser, slug: string) {
    const system = await this.prisma.anatomySystem.findUnique({
      where: { slug },
      include: {
        structures: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });

    if (!system || !system.isPublished) {
      throw new NotFoundException('Anatomy system not found');
    }

    if (!system.isSample) {
      await this.subscriptions.ensureActiveForStudent(user.id, user.role);
    }

    // Related structures are stored as slugs so the seed stays readable and
    // does not need to know generated ids. Resolve names in one pass, and drop
    // any stale slug instead of failing the whole system.
    const bySlug = new Map(
      system.structures.map((structure) => [structure.slug, structure]),
    );
    const structures = system.structures.map((structure) => ({
      ...structure,
      related: structure.relatedSlugs.flatMap((relatedSlug) => {
        const related = bySlug.get(relatedSlug);
        return related ? [{ slug: related.slug, name: related.name }] : [];
      }),
    }));

    return {
      ...system,
      structureCount: structures.length,
      structures,
    };
  }
}
