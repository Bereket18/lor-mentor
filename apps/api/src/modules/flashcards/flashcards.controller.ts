import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FlashcardsService } from './flashcards.service';
import { ReviewDto } from './dto/review.dto';

import type { RequestUser } from '../../common/types/request-user';

@Controller('flashcards')
@UseGuards(JwtAuthGuard)
export class FlashcardsController {
  constructor(private readonly service: FlashcardsService) {}

  // GET /api/v1/flashcards?courseId=xxx — sets for a course
  @Get()
  getSets(
    @Query('courseId') courseId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getSetsForCourse(courseId, user.id);
  }

  // GET /api/v1/flashcards/:setId — cards + per-card known state
  // Paid content — requires an active subscription.
  @Get(':setId')
  @UseGuards(SubscriptionGuard)
  getSet(@Param('setId') setId: string, @CurrentUser() user: RequestUser) {
    return this.service.getSet(setId, user.id);
  }

  // POST /api/v1/flashcards/:setId/review — mark a card known/unknown
  // Paid content — requires an active subscription.
  @Post(':setId/review')
  @UseGuards(SubscriptionGuard)
  review(
    @Param('setId') setId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReviewDto,
  ) {
    return this.service.review(setId, user.id, dto);
  }
}
