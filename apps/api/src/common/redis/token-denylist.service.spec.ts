import type { ConfigService } from '@nestjs/config';
import { TokenDenylistService } from './token-denylist.service';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    get: jest.fn(),
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
          get: jest.Mock;
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

  describe('per-user session revocation (password reset)', () => {
    it('records the revocation instant with a TTL', async () => {
      const { service, client } = createService();
      client.set.mockResolvedValue('OK');

      await service.revokeUserSessions('user-1', 604_800);

      const [key, value, mode, ttl] = client.set.mock.calls[0] as [
        string,
        string,
        string,
        number,
      ];
      expect(key).toBe('revoked:user:user-1');
      expect(Number(value)).toBeCloseTo(Date.now() / 1000, -1);
      expect(mode).toBe('EX');
      expect(ttl).toBe(604_800);
    });

    it('treats a token issued before the revocation as revoked', async () => {
      const { service, client } = createService();
      client.get.mockResolvedValue('1700000200');

      await expect(
        service.isSessionRevoked('user-1', 1_700_000_000),
      ).resolves.toBe(true);
    });

    it('treats a token issued after the revocation as active', async () => {
      const { service, client } = createService();
      client.get.mockResolvedValue('1700000200');

      await expect(
        service.isSessionRevoked('user-1', 1_700_000_300),
      ).resolves.toBe(false);
    });

    it('allows a token minted in the same second as the revocation', async () => {
      const { service, client } = createService();
      client.get.mockResolvedValue('1700000200');

      // `iat` has one-second resolution; rejecting this would sign a user out
      // immediately after they set their password.
      await expect(
        service.isSessionRevoked('user-1', 1_700_000_200),
      ).resolves.toBe(false);
    });

    it('is a no-op when the user never revoked anything', async () => {
      const { service, client } = createService();
      client.get.mockResolvedValue(null);

      await expect(service.isSessionRevoked('user-1', 1)).resolves.toBe(false);
    });

    it('denies an unpositionable token when a revocation exists', async () => {
      const { service, client } = createService();
      client.get.mockResolvedValue('1700000200');

      // No `iat` on the token: we cannot prove it postdates the reset.
      await expect(service.isSessionRevoked('user-1', undefined)).resolves.toBe(
        true,
      );
    });

    it('fails CLOSED when Redis is unreachable', async () => {
      const { service, client } = createService('closed');
      client.get.mockRejectedValue(new Error('Redis connection refused'));

      await expect(service.isSessionRevoked('user-1', 1)).resolves.toBe(true);
    });

    it('denies when the stored marker is not a timestamp', async () => {
      const { service, client } = createService();
      client.get.mockResolvedValue('not-a-number');

      await expect(service.isSessionRevoked('user-1', 1)).resolves.toBe(true);
    });

    it('ignores a missing user id', async () => {
      const { service } = createService();

      await expect(service.isSessionRevoked(undefined, 1)).resolves.toBe(false);
    });
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
