import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { SupportService } from './support.service';
import { SupportAttachmentsService } from './support-attachments.service';
import {
  AssignTicketDto,
  CreateInternalNoteDto,
  ReplyTicketDto,
} from './dto/create-ticket.dto';
import {
  AdminListTicketsDto,
  BulkCloseResolvedDto,
} from './dto/admin-list-tickets.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from './support.constants';

/**
 * The college's support queue. ADMIN and SUPER_ADMIN only; every mutation here
 * is picked up by the shared admin audit interceptor because the route
 * requires a role. Internal notes are served solely from these routes.
 */
@Controller('admin/support')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminSupportController {
  constructor(
    private readonly support: SupportService,
    private readonly attachments: SupportAttachmentsService,
  ) {}

  @Get('tickets')
  findAll(
    @CurrentUser() admin: RequestUser,
    @Query() query: AdminListTicketsDto,
  ) {
    return this.support.findAllAdmin(query, admin.id);
  }

  @Get('tickets/:id')
  findOne(@Param('id') id: string) {
    // Opening a thread is reading it: stamp the staff read marker first.
    return this.support.findOneAdmin(id, { markRead: true });
  }

  @Post('tickets/:id/messages')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
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
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
    @UploadedFiles()
    files: { attachments?: Express.Multer.File[] } = {},
  ) {
    const stored = await this.attachments.storeAll(files?.attachments);
    try {
      return await this.support.replyAsStaff(admin, id, dto, stored);
    } catch (error) {
      await this.attachments.removeFiles(stored.map((item) => item.storedName));
      throw error;
    }
  }

  @Patch('tickets/:id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTicketStatusDto) {
    return this.support.updateStatus(id, dto.status);
  }

  @Patch('tickets/:id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignTicketDto) {
    return this.support.assign(id, dto.assignedToId ?? null);
  }

  @Get('tickets/:id/notes')
  async notes(@Param('id') id: string) {
    const ticket = await this.support.findOneAdmin(id);
    return { items: ticket.internalNotes };
  }

  @Post('tickets/:id/notes')
  addNote(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateInternalNoteDto,
  ) {
    return this.support.addInternalNote(admin, id, dto.body);
  }

  /** Bulk action: close RESOLVED tickets untouched for seven days. */
  @Post('tickets/bulk-close-resolved')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(UserThrottlerGuard)
  bulkClose(@Body() dto: BulkCloseResolvedDto) {
    return this.support.closeStaleResolved(dto.olderThanDays);
  }

  /** Static canned replies. Served to staff only; never to a student route. */
  @Get('canned-replies')
  cannedReplies() {
    return { items: this.support.cannedReplies() };
  }

  @Get('staff')
  staff() {
    return this.support.assignableStaff();
  }
}
