import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  detectAllowedImageMime,
  type AllowedImageMime,
} from '../../common/utils/image-magic-bytes';
import {
  ALLOWED_ATTACHMENT_MIME,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_PIXELS,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from './support.constants';
import {
  ensureSupportUploadDir,
  purgeClosedAttachments,
  removeAttachmentFiles,
  resolveSupportUploadDir,
  type SupportPurgeSummary,
} from './support-attachments.storage';

/** The subset of multer's `Express.Multer.File` this service needs. */
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

export interface StoredImage {
  storedName: string;
  mimeType: AllowedImageMime;
  sizeBytes: number;
  width: number;
  height: number;
}

/** sharp writes JPEG/PNG/WebP; never trust the client's extension. */
const EXTENSION_FOR: Record<AllowedImageMime, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const FORMAT_FOR: Record<AllowedImageMime, 'jpeg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Attachment storage and retrieval.
 *
 * Security properties, in the order they matter:
 *
 *  1. The client's MIME type is checked against a whitelist, then the real
 *     leading bytes are checked with the shared magic-byte helper. A file that
 *     claims to be a JPEG but is not one never reaches sharp.
 *  2. The image is decoded and re-encoded by sharp. That strips EXIF (camera
 *     make/model/serial/GPS), normalises a hostile or exotic file to a plain
 *     image, and gives us the real width/height to store.
 *  3. The name on disk is 16 random bytes, so a student can never guess, and
 *     the original name is never stored or echoed.
 *  4. `openForDownload()` is the only reader. It re-checks that the caller owns
 *     the ticket (or is staff) and records an audit row when staff view a
 *     student's file.
 */
@Injectable()
export class SupportAttachmentsService {
  private readonly logger = new Logger(SupportAttachmentsService.name);
  private directoryReady = false;
  /** Absolute path of the private store (SUPPORT_UPLOAD_DIR, not public). */
  private readonly directory: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.directory = resolveSupportUploadDir(
      config.get<string>('SUPPORT_UPLOAD_DIR'),
    );
  }

  /** Validates, re-encodes and writes each image; returns metadata rows. */
  async storeAll(files: UploadedImage[] | undefined): Promise<StoredImage[]> {
    if (!files?.length) return [];
    if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new BadRequestException(
        `You can attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} images to one message.`,
      );
    }

    const stored: StoredImage[] = [];
    try {
      for (const file of files) {
        stored.push(await this.storeOne(file));
      }
      return stored;
    } catch (error) {
      // Never leave half a message's files behind when the third one is bad.
      await this.removeFiles(stored.map((item) => item.storedName));
      throw error;
    }
  }

  private async storeOne(file: UploadedImage): Promise<StoredImage> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('The uploaded file was empty.');
    }
    if (
      file.size > MAX_ATTACHMENT_BYTES ||
      file.buffer.length > MAX_ATTACHMENT_BYTES
    ) {
      throw new PayloadTooLargeException('Each image must be 5 MB or smaller.');
    }
    if (!ALLOWED_ATTACHMENT_MIME.includes(file.mimetype as AllowedImageMime)) {
      throw new BadRequestException(
        'Only JPEG, PNG, or WEBP images are allowed.',
      );
    }

    const detected = detectAllowedImageMime(file.buffer);
    if (!detected || detected !== file.mimetype) {
      throw new BadRequestException(
        'That file is not a real JPEG, PNG, or WEBP image.',
      );
    }

    let encoded: { data: Buffer; width: number; height: number };
    try {
      encoded = await this.reencode(file.buffer, detected);
    } catch {
      throw new BadRequestException('That image could not be processed.');
    }

    // Re-check after re-encoding: a valid header can still hide a huge image,
    // and the stored bytes are what counts against the size limit.
    if (encoded.data.length > MAX_ATTACHMENT_BYTES) {
      throw new PayloadTooLargeException(
        'That image is larger than 5 MB after processing.',
      );
    }

    this.ensureDirectory();
    const storedName = `${crypto.randomBytes(16).toString('hex')}${EXTENSION_FOR[detected]}`;
    await fs.promises.writeFile(
      path.join(this.directory, storedName),
      encoded.data,
      {
        mode: 0o600,
      },
    );

    return {
      storedName,
      mimeType: detected,
      sizeBytes: encoded.data.length,
      width: encoded.width,
      height: encoded.height,
    };
  }

  private async reencode(
    input: Buffer,
    mime: AllowedImageMime,
  ): Promise<{ data: Buffer; width: number; height: number }> {
    const pipeline = sharp(input, { limitInputPixels: MAX_ATTACHMENT_PIXELS })
      // `rotate()` applies the EXIF orientation, then drops all metadata when
      // we write without `withMetadata()` (sharp strips metadata by default).
      .rotate()
      .resize({
        width: 2600,
        height: 2600,
        fit: 'inside',
        withoutEnlargement: true,
      });

    const format = FORMAT_FOR[mime];
    const output =
      format === 'jpeg'
        ? pipeline.jpeg({ quality: 88, mozjpeg: true })
        : format === 'png'
          ? pipeline.png({ compressionLevel: 9 })
          : pipeline.webp({ quality: 88 });

    const { data, info } = await output.toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  }

  private ensureDirectory(): void {
    if (this.directoryReady) return;
    ensureSupportUploadDir(this.directory);
    this.directoryReady = true;
  }

  async removeFiles(storedNames: string[]): Promise<void> {
    const removed = await removeAttachmentFiles(this.directory, storedNames);
    if (removed !== storedNames.length) {
      this.logger.warn(
        `Deleted ${removed} of ${storedNames.length} support attachment files`,
      );
    }
  }

  /**
   * Authorised read. The caller is either the ticket owner or staff; anything
   * else is reported as not found so attachment ids cannot be probed.
   *
   * Every staff view writes an audit row (the audit interceptor only covers
   * mutating requests, so a GET needs an explicit record).
   */
  async openForDownload(input: {
    attachmentId: string;
    userId: string;
    isStaff: boolean;
    ipAddress?: string | null;
  }): Promise<{
    absolutePath: string;
    mimeType: string;
    sizeBytes: number;
  }> {
    const attachment = await this.prisma.supportAttachment.findUnique({
      where: { id: input.attachmentId },
      select: {
        id: true,
        storedName: true,
        mimeType: true,
        sizeBytes: true,
        message: {
          select: {
            ticket: { select: { id: true, userId: true, number: true } },
          },
        },
      },
    });

    if (!attachment) throw new NotFoundException('Attachment not found');
    const ticket = attachment.message.ticket;
    if (!input.isStaff && ticket.userId !== input.userId) {
      throw new NotFoundException('Attachment not found');
    }

    const absolutePath = path.join(
      this.directory,
      path.basename(attachment.storedName),
    );
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Attachment not found');
    }

    if (input.isStaff) {
      await this.audit.record({
        action: 'SUPPORT_ATTACHMENT_VIEW',
        actorId: input.userId,
        entityType: 'SupportAttachment',
        entityId: attachment.id,
        ipAddress: input.ipAddress ?? null,
        meta: {
          ticketId: ticket.id,
          ticketNumber: ticket.number,
          ownerId: ticket.userId,
        } satisfies Prisma.InputJsonValue,
      });
    }

    return {
      absolutePath,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    };
  }

  /**
   * Retention job: delete files (and rows) for tickets closed before `cutoff`.
   * The CLI wrapper is `src/scripts/support-retention.ts`; it defaults to a dry
   * run and needs `--apply` to delete anything.
   */
  async purgeClosedBefore(
    cutoff: Date,
    options: { dryRun: boolean },
  ): Promise<SupportPurgeSummary> {
    return purgeClosedAttachments(this.prisma, this.directory, cutoff, options);
  }
}
