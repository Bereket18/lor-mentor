import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  AUTH_MAIL_QUEUE,
  type AuthMailJobData,
  type AuthMailPayload,
} from './auth-mail.constants';
import { AuthMailCryptoService } from './auth-mail.crypto';

/**
 * Sends sign-in mail outside the request path.
 *
 * A decrypted payload exists only in this process for the duration of the job.
 * Failures are logged as a safe category; the recipient, code, link and raw
 * provider error are never written to application or audit logs.
 */
@Processor(AUTH_MAIL_QUEUE, { concurrency: 4 })
export class AuthMailProcessor extends WorkerHost {
  private readonly logger = new Logger(AuthMailProcessor.name);

  constructor(
    private readonly mail: MailService,
    private readonly crypto: AuthMailCryptoService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<AuthMailJobData>): Promise<void> {
    let payload: AuthMailPayload;
    try {
      payload = this.crypto.decrypt(job.data.payload);
    } catch {
      this.logger.error('Could not decrypt an auth-mail job');
      throw new Error('Invalid auth-mail payload');
    }

    // Decoys exist only to make initiation indistinguishable. They never send.
    if (!payload.deliverable) return;

    try {
      await this.mail.sendAuthSignIn({
        to: payload.to,
        code: payload.code,
        confirmationLink: payload.confirmationLink,
        expiresInMinutes: payload.expiresInMinutes,
      });
      await this.audit('AUTH_EMAIL_REQUESTED', payload.userId, {
        method: 'EMAIL_LINK',
        purpose: payload.purpose,
      });
    } catch {
      this.logger.error('Could not send a sign-in email (SMTP failure)');
      await this.audit('AUTH_EMAIL_DELIVERY_FAILED', payload.userId, {
        method: 'EMAIL_LINK',
      });
      // Let BullMQ apply the bounded retry policy.
      throw new Error('Sign-in mail delivery failed');
    }
  }

  private async audit(
    action: string,
    actorId: string | null,
    meta: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: actorId ?? null,
          action,
          entityType: actorId ? 'User' : null,
          entityId: actorId ?? null,
          meta: meta as unknown as Prisma.InputJsonValue,
        },
      });
    } catch {
      this.logger.warn(`Could not write audit event ${action}`);
    }
  }
}
