import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import {
  AUDIT_ADMIN_KEY,
  SKIP_AUDIT_KEY,
} from '../../common/decorators/audit.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/types/request-user';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditInterceptor } from './audit.interceptor';

const adminUser: RequestUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  fullName: 'Admin User',
  role: 'SUPER_ADMIN',
  phoneNumber: null,
  avatarPath: null,
  isActive: true,
  isEmailVerified: true,
  isAnatomyReviewer: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

function createContext(
  handler: (...args: never[]) => unknown,
  options: {
    method?: string;
    user?: RequestUser | null;
    body?: unknown;
    params?: Record<string, string>;
  } = {},
): ExecutionContext {
  class UsersController {}
  class PaymentsController {}

  const isPaymentHandler =
    handler.name === 'getReceipt' || handler.name === 'addBank';
  const controller = isPaymentHandler ? PaymentsController : UsersController;

  const request = {
    method: options.method ?? 'POST',
    user: options.user === null ? undefined : (options.user ?? adminUser),
    body: options.body,
    params: options.params ?? { id: 'target-1' },
    originalUrl: '/api/v1/users/target-1/role',
    headers: { 'user-agent': 'jest-agent' },
    ip: '::ffff:127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    route: { path: '/:id/role' },
  };

  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;
}

interface AuditCreateArgs {
  data: {
    actorId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    ipAddress?: string;
    meta?: {
      label?: string;
      category?: string;
      method?: string;
      path?: string;
      statusCode?: number;
      actor?: { id?: string; fullName?: string };
      changes?: Record<string, unknown>;
      [key: string]: unknown;
    };
  };
}

function createInterceptor() {
  const create = jest.fn(
    (_args: AuditCreateArgs): Promise<unknown> => Promise.resolve({}),
  );
  const prisma = {
    auditLog: { create },
  } as unknown as PrismaService;

  return {
    create,
    interceptor: new AuditInterceptor(prisma, new Reflector()),
  };
}

describe('AuditInterceptor', () => {
  it('records a successful admin mutation with request context', async () => {
    const changeRole = () => ({ ok: true });
    Reflect.defineMetadata(ROLES_KEY, ['ADMIN', 'SUPER_ADMIN'], changeRole);

    const { create, interceptor } = createInterceptor();
    const context = createContext(changeRole, {
      body: {
        role: 'TEACHER',
        password: 'must-not-be-stored',
        accountNumber: '1234567890',
      },
      params: { id: 'target-1' },
    });

    const result = await firstValueFrom(
      interceptor.intercept(context, { handle: () => of({ ok: true }) }),
    );

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
      actorId: 'admin-1',
      action: 'users.changeRole',
      entityType: 'User',
      entityId: 'target-1',
      ipAddress: '127.0.0.1',
      meta: {
        label: 'Changed user role',
        category: 'Users',
        method: 'POST',
        path: '/api/v1/users/target-1/role',
        statusCode: 200,
        actor: {
          id: 'admin-1',
          fullName: 'Admin User',
        },
        changes: {
          role: 'TEACHER',
          password: '[redacted]',
          accountNumber: '[redacted]',
        },
      },
    });
  });

  it('skips handlers that write their own audit record', async () => {
    const changeStatus = () => ({ ok: true });
    Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], changeStatus);
    Reflect.defineMetadata(SKIP_AUDIT_KEY, true, changeStatus);

    const { create, interceptor } = createInterceptor();

    await firstValueFrom(
      interceptor.intercept(createContext(changeStatus), {
        handle: () => of({ ok: true }),
      }),
    );

    expect(create).not.toHaveBeenCalled();
  });

  it('does not audit non-admin callers', async () => {
    const changeRole = () => ({ ok: true });
    Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], changeRole);

    const { create, interceptor } = createInterceptor();

    await firstValueFrom(
      interceptor.intercept(
        createContext(changeRole, { user: { ...adminUser, role: 'TEACHER' } }),
        { handle: () => of({ ok: true }) },
      ),
    );

    expect(create).not.toHaveBeenCalled();
  });

  it('only audits reads that explicitly opt in', async () => {
    const getReceipt = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], getReceipt);

    const { create, interceptor } = createInterceptor();

    await firstValueFrom(
      interceptor.intercept(createContext(getReceipt, { method: 'GET' }), {
        handle: () => of(undefined),
      }),
    );
    expect(create).not.toHaveBeenCalled();

    Reflect.defineMetadata(AUDIT_ADMIN_KEY, { read: true }, getReceipt);

    await firstValueFrom(
      interceptor.intercept(
        createContext(getReceipt, {
          method: 'GET',
          params: { id: 'payment-1' },
        }),
        { handle: () => of(undefined) },
      ),
    );

    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
      action: 'payments.getReceipt',
      entityType: 'Payment',
      entityId: 'payment-1',
    });
  });

  it('uses a bank code as the target for accepted-bank changes', async () => {
    const addBank = () => ({ ok: true });
    Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], addBank);

    const { create, interceptor } = createInterceptor();

    await firstValueFrom(
      interceptor.intercept(
        createContext(addBank, {
          body: { code: 'CBE', name: 'Commercial Bank of Ethiopia' },
          params: {},
        }),
        { handle: () => of({ ok: true }) },
      ),
    );

    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
      action: 'payments.addBank',
      entityType: 'PaymentBank',
      entityId: 'CBE',
      meta: { label: 'Added accepted bank' },
    });
  });
});
