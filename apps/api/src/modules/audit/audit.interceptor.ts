import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { mergeMap, type Observable } from 'rxjs';
import {
  AUDIT_ADMIN_KEY,
  SKIP_AUDIT_KEY,
} from '../../common/decorators/audit.decorator';
import type { AuditAdminOptions } from '../../common/decorators/audit.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { describeAuditEvent, isAdminRole } from './audit-action.util';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEY =
  /(password|passcode|secret|token|authorization|cookie|receipt|document|file|account(?:number|name)?|phone)/i;
const MAX_STRING_LENGTH = 240;

type AuditRequest = Request & {
  user?: RequestUser;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(value: string, maxLength = MAX_STRING_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (depth >= 2) return '[truncated]';

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeValue(item, depth + 1));
  }

  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        result[key] = '[redacted]';
        continue;
      }
      if (typeof item === 'function' || Buffer.isBuffer(item)) continue;
      result[key] = sanitizeValue(item, depth + 1);
    }
    return result;
  }

  return '[unserializable]';
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.join(', ');
  return value;
}

function clientIp(request: AuditRequest): string | null {
  const raw = request.ip || request.socket?.remoteAddress || '';
  if (!raw) return null;
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

function findResponseId(
  value: unknown,
  depth = 0,
  includeCode = false,
): string | null {
  if (depth > 2 || !isRecord(value)) return null;
  if (typeof value.id === 'string' && value.id) return value.id;
  if (includeCode && typeof value.code === 'string' && value.code) {
    return value.code;
  }

  for (const key of [
    'user',
    'department',
    'academicYear',
    'semester',
    'course',
    'material',
    'plan',
    'payment',
    'report',
    'bank',
    'data',
  ]) {
    const nested = findResponseId(value[key], depth + 1, includeCode);
    if (nested) return nested;
  }

  return null;
}

function extractEntityId(
  request: AuditRequest,
  data: unknown,
  entityType: string,
): string | null {
  const params = request.params ?? {};
  const paramId =
    params.id ??
    params.code ??
    params.materialId ??
    params.setId ??
    params.courseId;
  if (typeof paramId === 'string' && paramId) return paramId;

  if (isRecord(request.body)) {
    if (typeof request.body.id === 'string' && request.body.id) {
      return request.body.id;
    }
    if (
      entityType === 'PaymentBank' &&
      typeof request.body.code === 'string' &&
      request.body.code
    ) {
      return request.body.code;
    }
  }

  return findResponseId(data, 0, entityType === 'PaymentBank');
}

function stripQuery(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const queryIndex = value.indexOf('?');
  return queryIndex === -1 ? value : value.slice(0, queryIndex);
}

/**
 * Records every successful state-changing request made by an ADMIN or
 * SUPER_ADMIN on an admin route. Handlers that already write a richer audit
 * entry opt out with @SkipAudit(); shared moderation endpoints opt in with
 * @AuditAdmin().
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const controller = context.getClass();
    const targets = [handler, controller];

    if (this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, targets)) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuditRequest>();
    const method = request.method?.toUpperCase() ?? '';
    const auditOptions = this.reflector.getAllAndOverride<AuditAdminOptions>(
      AUDIT_ADMIN_KEY,
      targets,
    );
    const isMutation = MUTATING_METHODS.has(method);

    if (!isMutation && !auditOptions?.read) {
      return next.handle();
    }

    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets) ?? [];
    const isAdminRoute = requiredRoles.some(
      (role) => role === 'ADMIN' || role === 'SUPER_ADMIN',
    );

    if (!isAdminRoute && !auditOptions) {
      return next.handle();
    }

    const user = request.user;
    if (!user || !isAdminRole(user.role)) {
      return next.handle();
    }

    const startedAt = Date.now();
    const controllerName = controller.name.replace(/Controller$/, '');
    const handlerName = handler.name;

    return next.handle().pipe(
      mergeMap(async (data: unknown) => {
        try {
          await this.record(
            request,
            context,
            data,
            startedAt,
            controllerName,
            handlerName,
          );
        } catch (error) {
          this.logger.error(
            'Could not write automatic admin audit entry',
            error instanceof Error ? error.stack : String(error),
          );
        }
        return data;
      }),
    );
  }

  private async record(
    request: AuditRequest,
    context: ExecutionContext,
    data: unknown,
    startedAt: number,
    controllerName: string,
    handlerName: string,
  ): Promise<void> {
    const user = request.user;
    if (!user) return;

    const response = context.switchToHttp().getResponse<Response>();
    const descriptor = describeAuditEvent(controllerName, handlerName);

    const meta: Record<string, unknown> = {
      label: descriptor.label,
      category: descriptor.category,
      source: 'admin-auto',
      method: request.method?.toUpperCase(),
      path: stripQuery(request.originalUrl),
      statusCode: response.statusCode,
      durationMs: Date.now() - startedAt,
      actor: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    };

    const routePath = (request as unknown as { route?: { path?: unknown } })
      .route?.path;
    if (typeof routePath === 'string' && routePath) meta.route = routePath;

    const params = sanitizeValue(request.params ?? {});
    if (isRecord(params) && Object.keys(params).length > 0) {
      meta.params = params;
    }

    const changes = sanitizeValue(request.body);
    if (isRecord(changes) && Object.keys(changes).length > 0) {
      meta.changes = changes;
    }

    const userAgent = firstHeader(request.headers['user-agent']);
    if (userAgent) meta.userAgent = truncate(userAgent, 400);

    const forwardedFor = firstHeader(request.headers['x-forwarded-for']);
    if (forwardedFor) meta.forwardedFor = truncate(forwardedFor, 400);

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: descriptor.action,
        entityType: descriptor.entityType,
        entityId: extractEntityId(request, data, descriptor.entityType),
        ipAddress: clientIp(request),
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
