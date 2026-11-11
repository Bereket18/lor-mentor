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
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { SupportService } from './support.service';
import { CreateTicketDto, ReplyTicketDto } from './dto/create-ticket.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';

/**
 * Student-facing support. Every route is scoped to the signed-in user's id
 * from the JWT; there is no userId parameter to tamper with.
 */
@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets')
  findMine(@CurrentUser() user: RequestUser, @Query() query: ListTicketsDto) {
    return this.support.findMine(user.id, query);
  }

  @Get('tickets/:id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.support.findOne(user.id, id);
  }

  // Writing to support sends an email and creates admin notifications, so it
  // is rate-limited per account rather than per IP (campus NAT shares one IP).
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('tickets')
  @UseGuards(UserThrottlerGuard)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTicketDto) {
    return this.support.create(user, dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('tickets/:id/messages')
  @UseGuards(UserThrottlerGuard)
  reply(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.support.reply(user.id, id, dto);
  }

  @Patch('tickets/:id/close')
  close(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.support.close(user.id, id);
  }
}
