import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  AUTH_MAIL_JOB,
  AUTH_MAIL_QUEUE,
  type AuthMailJobData,
  type AuthMailPayload,
} from './auth-mail.constants';
import { AuthMailCryptoService } from './auth-mail.crypto';

/**
 * Enqueue a sign-in mail without putting its plaintext in Redis.
 *
 * This is intentionally a thin wrapper: the caller always enqueues, including
 * for a non-deliverable decoy, so the request path has one shape. The worker
 * decides whether to send.
 */
@Injectable()
export class AuthMailService {
  constructor(
    @InjectQueue(AUTH_MAIL_QUEUE)
    private readonly queue: Queue<AuthMailJobData>,
    private readonly crypto: AuthMailCryptoService,
  ) {}

  async enqueue(payload: AuthMailPayload): Promise<void> {
    const encrypted = this.crypto.encrypt(payload);
    await this.queue.add(
      AUTH_MAIL_JOB,
      { payload: encrypted },
      { jobId: `auth-mail-${payload.challengeId}` },
    );
  }
}
