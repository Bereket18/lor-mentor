import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { SupportService } from './support.service';
import { ReplyTicketDto } from './dto/create-ticket.dto';
import { AdminListTicketsDto } from './dto/admin-list-tickets.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

/**
 * The college's support queue. ADMIN and SUPER_ADMIN already exist; no new
 * role or permission surface is introduced, and every mutation here is picked
 * up by the shared admin audit interceptor because the route requires a role.
 */
@Controller('admin/support')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets')
  findAll(@Query() query: AdminListTicketsDto) {
    return this.support.findAllAdmin(query);
  }

  @Get('tickets/:id')
  findOne(@Param('id') id: string) {
    return this.support.findOneAdmin(id);
  }

  @Post('tickets/:id/messages')
  reply(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.support.replyAsStaff(admin, id, dto);
  }

  @Patch('tickets/:id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTicketStatusDto) {
    return this.support.updateStatus(id, dto.status);
  }
}
