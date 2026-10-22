import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { auditLabelForAction, humanizeEntityType } from './audit-action.util';
import type { AuditQueryDto } from './dto/audit-query.dto';

const DEFAULT_TAKE = 25;
const MAX_TAKE = 500;
const FACET_ACTION_LIMIT = 40;

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Read access to the audit trail. Writes are performed by individual services
 * (for actions that need domain-specific metadata) and by AuditInterceptor for
 * every state-changing admin request.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AuditQueryDto = {}) {
    const take = clampInteger(query.take, DEFAULT_TAKE, 1, MAX_TAKE);
    const skip = Math.max(
      0,
      Number.isFinite(query.skip) ? Math.trunc(query.skip ?? 0) : 0,
    );
    const where = this.buildWhere(query);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      items,
      total,
      allTimeTotal,
      todayTotal,
      actorGroups,
      actionGroups,
      entityGroups,
    ] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
        include: {
          actor: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.count(),
      this.prisma.auditLog.count({
        where: { createdAt: { gte: startOfToday } },
      }),
      this.prisma.auditLog.groupBy({
        by: ['actorId'],
        _count: { _all: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        _count: { _all: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ['entityType'],
        _count: { _all: true },
      }),
    ]);

    const actions = actionGroups
      .map((group) => ({
        value: group.action,
        label: auditLabelForAction(group.action),
        count: group._count._all,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, FACET_ACTION_LIMIT);

    const entities = entityGroups
      .filter(
        (group): group is typeof group & { entityType: string } =>
          group.entityType !== null,
      )
      .map((group) => ({
        value: group.entityType,
        label: humanizeEntityType(group.entityType),
        count: group._count._all,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    return {
      items,
      total,
      take,
      skip,
      hasMore: skip + items.length < total,
      stats: {
        total: allTimeTotal,
        today: todayTotal,
        actors: actorGroups.filter((group) => group.actorId !== null).length,
      },
      facets: {
        actions,
        entities,
      },
    };
  }

  private buildWhere(query: AuditQueryDto): Prisma.AuditLogWhereInput {
    const filters: Prisma.AuditLogWhereInput[] = [];
    const search = query.search?.trim();

    if (search) {
      filters.push({
        OR: [
          { action: { contains: search, mode: 'insensitive' } },
          { entityType: { contains: search, mode: 'insensitive' } },
          { entityId: { contains: search, mode: 'insensitive' } },
          {
            actor: {
              is: { fullName: { contains: search, mode: 'insensitive' } },
            },
          },
          {
            actor: {
              is: { email: { contains: search, mode: 'insensitive' } },
            },
          },
        ],
      });
    }

    if (query.action?.trim()) {
      filters.push({ action: query.action.trim() });
    }
    if (query.entityType?.trim()) {
      filters.push({ entityType: query.entityType.trim() });
    }
    if (query.actorId?.trim()) {
      filters.push({ actorId: query.actorId.trim() });
    }

    const from = parseDate(query.from);
    if (from) filters.push({ createdAt: { gte: from } });

    const to = parseDate(query.to);
    if (to) filters.push({ createdAt: { lte: to } });

    return filters.length ? { AND: filters } : {};
  }
}
