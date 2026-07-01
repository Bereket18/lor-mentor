import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TutorService } from './tutor.service';
import { ChatDto } from './dto/chat.dto';

import type { RequestUser } from '../../common/types/request-user';

@Controller('tutor')
@UseGuards(JwtAuthGuard)
export class TutorController {
  constructor(private readonly service: TutorService) {}

  // POST /api/v1/tutor/chat — ask the AI tutor a question
  @Post('chat')
  chat(@CurrentUser() user: RequestUser, @Body() dto: ChatDto) {
    return this.service.chat(user.id, dto);
  }

  // GET /api/v1/tutor/history — this user's recent conversations
  @Get('history')
  history(@CurrentUser() user: RequestUser) {
    return this.service.getHistory(user.id);
  }
}
