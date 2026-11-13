import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { SupportService } from './support.service';
import { SupportAttachmentsService } from './support-attachments.service';
import { CreateTicketDto, ReplyTicketDto } from './dto/create-ticket.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { ADMIN_ROLES } from './support.roles';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from './support.constants';

/**
 * Student-facing support. Every route is scoped to the signed-in user's id
 * from the JWT; there is no userId parameter to tamper with.
 *
 * Attachments arrive in the same multipart request as the message so a message
 * is never saved without the images the student chose, and the route-level
 * throttle (per user, not per IP) covers the upload as well as the text.
 */
@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly attachments: SupportAttachmentsService,
  ) {}

  @Get('tickets')
  findMine(@CurrentUser() user: RequestUser, @Query() query: ListTicketsDto) {
    return this.support.findMine(user.id, query);
  }

  @Get('payments')
  listPayments(@CurrentUser() user: RequestUser) {
    return this.support.listOwnPayments(user.id);
  }

  @Get('tickets/:id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.support.findOne(user.id, id);
  }

  @Post('tickets/:id/read')
  markRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.support.markRead(user.id, id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('tickets')
  @UseGuards(UserThrottlerGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'attachments', maxCount: MAX_ATTACHMENTS_PER_MESSAGE }],
      {
        limits: {
          fileSize: MAX_ATTACHMENT_BYTES,
          files: MAX_ATTACHMENTS_PER_MESSAGE,
        },
      },
    ),
  )
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateTicketDto,
    @UploadedFiles()
    files: { attachments?: Express.Multer.File[] } = {},
  ) {
    // The field maxCount above rejects a fourth file before it reaches here.
    const stored = await this.attachments.storeAll(files?.attachments);
    try {
      return await this.support.create(user, dto, stored);
    } catch (error) {
      await this.attachments.removeFiles(stored.map((item) => item.storedName));
      throw error;
    }
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('tickets/:id/messages')
  @UseGuards(UserThrottlerGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'attachments', maxCount: MAX_ATTACHMENTS_PER_MESSAGE }],
      {
        limits: {
          fileSize: MAX_ATTACHMENT_BYTES,
          files: MAX_ATTACHMENTS_PER_MESSAGE,
        },
      },
    ),
  )
  async reply(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
    @UploadedFiles()
    files: { attachments?: Express.Multer.File[] } = {},
  ) {
    const stored = await this.attachments.storeAll(files?.attachments);
    try {
      return await this.support.reply(user.id, id, dto, stored);
    } catch (error) {
      await this.attachments.removeFiles(stored.map((item) => item.storedName));
      throw error;
    }
  }

  /** "Mark as resolved" - replaces the old student "close". */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch('tickets/:id/resolve')
  @UseGuards(UserThrottlerGuard)
  resolve(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.support.resolve(user.id, id);
  }

  /**
   * The only reader for an attachment. Owner or staff only; a 404 for anything
   * else so an id cannot be used to discover other students' files.
   */
  @Get('attachments/:id')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseGuards(UserThrottlerGuard)
  async download(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Ip() ip: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.attachments.openForDownload({
      attachmentId: id,
      userId: user.id,
      isStaff: (ADMIN_ROLES as readonly string[]).includes(user.role),
      ipAddress: ip,
    });

    // Stored type, never the client's; never sniffed; never cached by a proxy.
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(file.absolutePath, (error) => {
      if (error && !res.headersSent) res.status(404).end();
    });
  }
}
