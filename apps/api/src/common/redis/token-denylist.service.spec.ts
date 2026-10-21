import type { ConfigService } from '@nestjs/config';
import { TokenDenylistService } from './token-denylist.service';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    exists: jest.fn(),
    set: jest.fn(),
    quit: jest.fn(),
  })),
}));

function makeConfig(failMode: 'closed' | 'open' = 'closed'): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'REDIS_FAIL_MODE') return failMode;
      if (key === 'REDIS_HOST') return 'localhost';
      if (key === 'REDIS_PORT') return '6379';
      return undefined;
    }),
  } as unknown as ConfigService;
}

describe('TokenDenylistService', () => {
  function createService(failMode: 'closed' | 'open' = 'closed') {
    const service = new TokenDenylistService(makeConfig(failMode));
    const client = (
      service as unknown as {
        client: {
          exists: jest.Mock;
          set: jest.Mock;
          quit: jest.Mock;
        };
      }
    ).client;
    return { service, client };
  }

  it('treats a token as denied when Redis has the key', async () => {
    const { service, client } = createService();
    client.exists.mockResolvedValue(1);

    await expect(service.isDenied('token-1')).resolves.toBe(true);
    expect(client.exists).toHaveBeenCalledWith('denylist:refresh:token-1');
  });

  it('treats a token as active when Redis does not have the key', async () => {
    const { service, client } = createService();
    client.exists.mockResolvedValue(0);

    await expect(service.isDenied('token-2')).resolves.toBe(false);
  });

  it('fails CLOSED (denies) when Redis is unreachable', async () => {
    const { service, client } = createService('closed');
    client.exists.mockRejectedValue(new Error('Redis connection refused'));

    await expect(service.isDenied('token-3')).resolves.toBe(true);
  });

  it('fails OPEN only when REDIS_FAIL_MODE=open is explicit', async () => {
    const { service, client } = createService('open');
    client.exists.mockRejectedValue(new Error('Redis connection refused'));

    await expect(service.isDenied('token-4')).resolves.toBe(false);
  });

  it('does not deny a token without a jti (legacy token shape)', async () => {
    const { service } = createService();

    await expect(service.isDenied(undefined)).resolves.toBe(false);
  });

  it('stores a denial with a TTL', async () => {
    const { service, client } = createService();
    client.set.mockResolvedValue('OK');

    await service.deny('token-5', 10.2);

    expect(client.set).toHaveBeenCalledWith(
      'denylist:refresh:token-5',
      '1',
      'EX',
      11,
    );
  });

  it('ignores empty ids and past TTLs', async () => {
    const { service, client } = createService();

    await service.deny('', 10);
    await service.deny('token-6', 0);

    expect(client.set).not.toHaveBeenCalled();
  });

  it('closes the Redis connection on module destroy', async () => {
    const { service, client } = createService();
    client.quit.mockResolvedValue('OK');

    await service.onModuleDestroy();

    expect(client.quit).toHaveBeenCalled();
  });
});
