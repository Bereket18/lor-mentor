import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProgressService } from './progress.service';

import type { RequestUser } from '../../common/types/request-user';

@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private readonly service: ProgressService) {}

  // GET /api/v1/progress/me — per-course + overall progress
  @Get('me')
  getMine(@CurrentUser() user: RequestUser) {
    return this.service.getMyProgress(user.id);
  }

  // POST /api/v1/progress/:materialId — mark a material viewed
  @Post(':materialId')
  record(
    @Param('materialId') materialId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.recordView(user.id, materialId);
  }
}
