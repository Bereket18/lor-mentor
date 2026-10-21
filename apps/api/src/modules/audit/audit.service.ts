import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_TAKE = 100;
const MAX_TAKE = 500;

/**
 * Read-only access to the audit trail (audit finding F-32: the dashboard page
 * called GET /audit, but the endpoint did not exist, so the page was always
 * empty). Writes to AuditLog continue to happen inline from each action.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(take?: string) {
    const parsed = parseInt(take ?? '', 10);
    const limit = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), MAX_TAKE)
      : DEFAULT_TAKE;

    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: { select: { id: true, fullName: true, email: true } },
      },
    });
  }
}
