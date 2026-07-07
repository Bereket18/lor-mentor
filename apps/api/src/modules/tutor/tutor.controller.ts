import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TutorService } from './tutor.service';
import { ChatDto } from './dto/chat.dto';

import type { RequestUser } from '../../common/types/request-user';

// JwtAuthGuard runs first (populates req.user), then UserThrottlerGuard so the
// AI rate limit is keyed per account, not per shared IP.
@Controller('tutor')
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
export class TutorController {
  constructor(private readonly service: TutorService) {}

  // POST /api/v1/tutor/chat — ask the AI tutor a question.
  // Each call hits the paid Gemini API, so cap it hard per user to bound cost
  // and prevent a single account from running up the AI bill.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('chat')
  chat(@CurrentUser() user: RequestUser, @Body() dto: ChatDto) {
    return this.service.chat(user, dto);
  }

  // GET /api/v1/tutor/history — this user's recent conversations
  @Get('history')
  history(@CurrentUser() user: RequestUser) {
    return this.service.getHistory(user.id);
  }
}
