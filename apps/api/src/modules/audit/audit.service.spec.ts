import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService.findAll', () => {
  const findLogs = jest.fn();

  const prisma = {
    auditLog: { findMany: findLogs },
  } as unknown as PrismaService;

  const service = new AuditService(prisma);

  beforeEach(() => {
    findLogs.mockReset().mockResolvedValue([]);
  });

  it('returns the newest entries first with the actor attached', async () => {
    await service.findAll('');

    expect(findLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          actor: { select: { id: true, fullName: true, email: true } },
        },
      }),
    );
  });

  it('clamps take into 1..500 and falls back to 100 for garbage input', async () => {
    await service.findAll('5000');
    expect(findLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 500 }),
    );

    await service.findAll('0');
    expect(findLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 1 }),
    );

    await service.findAll('abc');
    expect(findLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
});
