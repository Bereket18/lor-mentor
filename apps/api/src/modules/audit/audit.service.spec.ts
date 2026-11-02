import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';

interface FindManyArgs {
  where?: { AND?: Array<{ OR?: unknown[] }> };
}

describe('AuditService.findAll', () => {
  const findLogs = jest.fn(
    (_args: FindManyArgs): Promise<unknown[]> => Promise.resolve([]),
  );
  const countLogs = jest.fn();
  const groupLogs = jest.fn();

  const prisma = {
    auditLog: {
      findMany: findLogs,
      count: countLogs,
      groupBy: groupLogs,
    },
  } as unknown as PrismaService;

  const service = new AuditService(prisma);

  beforeEach(() => {
    findLogs.mockReset().mockResolvedValue([]);
    countLogs.mockReset().mockResolvedValue(0);
    groupLogs.mockReset().mockResolvedValue([]);
  });

  it('returns the newest entries first with the actor attached', async () => {
    const result = await service.findAll();

    expect(findLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 25,
        skip: 0,
        include: {
          actor: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
      }),
    );
    expect(result).toMatchObject({
      items: [],
      total: 0,
      take: 25,
      skip: 0,
      hasMore: false,
      stats: { total: 0, today: 0, actors: 0 },
      facets: { actions: [], entities: [] },
    });
  });

  it('clamps take into 1..500 and defaults to 25 for missing input', async () => {
    await service.findAll({ take: 5000 });
    expect(findLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 500 }),
    );

    await service.findAll({ take: 0 });
    expect(findLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 1 }),
    );

    await service.findAll({});
    expect(findLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 25 }),
    );
  });

  it('builds search, action, area, actor and date filters', async () => {
    await service.findAll({
      search: 'Jane',
      action: 'users.changeRole',
      actionPrefix: 'ANATOMY_',
      entityType: 'User',
      actorId: 'actor-1',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-02T00:00:00.000Z',
    });

    const where = findLogs.mock.calls[0]?.[0]?.where;
    expect(where?.AND).toEqual(
      expect.arrayContaining([
        { action: 'users.changeRole' },
        { action: { startsWith: 'ANATOMY_' } },
        { entityType: 'User' },
        { actorId: 'actor-1' },
        { createdAt: { gte: new Date('2026-10-01T00:00:00.000Z') } },
        { createdAt: { lte: new Date('2026-10-02T00:00:00.000Z') } },
      ]),
    );
    expect(where?.AND?.[0]?.OR).toEqual(
      expect.arrayContaining([
        { action: { contains: 'Jane', mode: 'insensitive' } },
        { entityType: { contains: 'Jane', mode: 'insensitive' } },
        { entityId: { contains: 'Jane', mode: 'insensitive' } },
      ]),
    );
  });

  it('returns counts and labelled, sorted facets', async () => {
    findLogs.mockResolvedValue([{ id: 'log-1' }]);
    countLogs
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(7);
    groupLogs
      .mockResolvedValueOnce([
        { actorId: 'actor-1', _count: { _all: 5 } },
        { actorId: 'actor-2', _count: { _all: 2 } },
        { actorId: null, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { action: 'PAYMENT_APPROVED', _count: { _all: 9 } },
        { action: 'users.changeRole', _count: { _all: 4 } },
      ])
      .mockResolvedValueOnce([
        { entityType: 'Payment', _count: { _all: 9 } },
        { entityType: null, _count: { _all: 1 } },
      ]);

    const result = await service.findAll({ skip: 0, take: 25 });

    expect(result.total).toBe(12);
    expect(result.hasMore).toBe(true);
    expect(result.stats).toEqual({ total: 100, today: 7, actors: 2 });
    expect(result.facets.actions).toEqual([
      { value: 'PAYMENT_APPROVED', label: 'Payment approved', count: 9 },
      { value: 'users.changeRole', label: 'Changed user role', count: 4 },
    ]);
    expect(result.facets.entities).toEqual([
      { value: 'Payment', label: 'Payment', count: 9 },
    ]);
  });
});
